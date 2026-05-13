import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Animated,
  Easing,
  FlatList,
  InteractionManager,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider, KeyboardStickyView } from 'react-native-keyboard-controller';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const STORAGE_KEY = 'eisenhower-mobile.tasks.v1';
const HISTORY_KEY = 'eisenhower-mobile.history.v1';
const ACTIVE_DAY_KEY = 'eisenhower-mobile.activeDay.v1';
const MAX_HISTORY_DAYS = 90;
const DELETE_TARGET_HEIGHT = 76;
const DELETE_BAR_HEIGHT = 30;
const AUTO_SCROLL_EDGE = 46;
const COMPOSER_BOTTOM_GAP = 12;
const COMPOSER_KEYBOARD_GAP = 10;
const PERSIST_DELAY = 180;
const INITIAL_RENDER_TASKS = 8;
const TASK_RENDER_BATCH = 6;
const LIST_WINDOW_SIZE = 5;
const DROP_HIT_TEST_INTERVAL = 40;
const DRAG_POINT_EPSILON = 1.25;
const LONG_TASK_TEXT_LENGTH = 34;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const INK = '#161616';
const APP_SURFACE = '#F7F7F4';
const PANEL_SURFACE = '#FAFAF8';
const HAIRLINE_DARK = 'rgba(22,22,22,0.12)';
const DROP_GUIDE = '#F4C430';
const DANGER = '#D94A3A';
const DANGER_SOFT = 'rgba(217,74,58,0.16)';
const HISTORY_OPEN_TRIGGER = 92;
const HISTORY_CLOSE_TRIGGER = 92;

const TYPE = {
  screenTitle: { fontFamily: 'Nunito_900Black', fontSize: 26, lineHeight: 32 },
  screenSubtitle: { fontFamily: 'Nunito_700Bold', fontSize: 11.5, lineHeight: 16 },
  sectionLabel: { fontFamily: 'Nunito_900Black', fontSize: 10, lineHeight: 13, letterSpacing: 0, textTransform: 'uppercase' },
  rowTitle: { fontFamily: 'Nunito_900Black', fontSize: 15, lineHeight: 19 },
  rowMeta: { fontFamily: 'Nunito_700Bold', fontSize: 10.5, lineHeight: 14 },
  tileTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 14, lineHeight: 17 },
  tileMeta: { fontFamily: 'Nunito_700Bold', fontSize: 9.5, lineHeight: 12.5 },
  task: { fontFamily: 'Nunito_600SemiBold', fontSize: 11.5, lineHeight: 16 },
  dragLabel: { fontFamily: 'Nunito_800ExtraBold', fontSize: 12, lineHeight: 16 },
  button: { fontFamily: 'Nunito_900Black', fontSize: 12, lineHeight: 16 },
  smallButton: { fontFamily: 'Nunito_900Black', fontSize: 11, lineHeight: 15 },
  composerTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 15, lineHeight: 19 },
  composerMeta: { fontFamily: 'Nunito_700Bold', fontSize: 10.5, lineHeight: 14 },
  input: { fontFamily: 'Nunito_600SemiBold', fontSize: 14, lineHeight: 18 },
};

const MOTION = {
  enter: 150,
  exit: 105,
  quick: 80,
  out: Easing.out(Easing.cubic),
  in: Easing.in(Easing.cubic),
};

const QUADS = [
  { id: 'q1', title: 'Do Now', desc: 'Urgent - Important' },
  { id: 'q2', title: 'Schedule', desc: 'Important - Not urgent' },
  { id: 'q3', title: 'Delegate', desc: 'Urgent - Not important' },
  { id: 'q4', title: 'Eliminate', desc: 'Not urgent - Not important' },
];

const INIT = {
  q1: [{ id: 1, text: 'Reply to the urgent email', done: false }],
  q2: [
    { id: 2, text: 'Read the strategy book', done: false },
    { id: 3, text: 'Write the quarterly plan', done: false },
  ],
  q3: [{ id: 4, text: 'Team sync call', done: false }],
  q4: [{ id: 5, text: 'Check social feeds', done: false }],
};

const COLORS = {
  q1: { bg: '#161616', fg: '#FFFFFF', muted: 'rgba(255,255,255,0.50)', check: '#FFFFFF', done: 'rgba(255,255,255,0.36)' },
  q2: { bg: '#FFE68A', fg: INK, muted: 'rgba(22,22,22,0.50)', check: INK, done: 'rgba(22,22,22,0.34)' },
  q3: { bg: '#F2F2F0', fg: INK, muted: 'rgba(22,22,22,0.46)', check: INK, done: 'rgba(22,22,22,0.32)' },
  q4: { bg: '#F7DAD5', fg: INK, muted: 'rgba(22,22,22,0.46)', check: INK, done: 'rgba(22,22,22,0.32)' },
};

const TASK_DIVIDER_COLORS = {
  q1: 'rgba(255,255,255,0.14)',
  q2: 'rgba(22,22,22,0.12)',
  q3: 'rgba(22,22,22,0.10)',
  q4: 'rgba(22,22,22,0.10)',
};

function getNextId(tasks) {
  return Math.max(0, ...Object.values(tasks).flat().map(task => Number(task.id) || 0)) + 1;
}

function isValidTasks(value) {
  return value && QUADS.every(q => Array.isArray(value[q.id]));
}

function createEmptyTasks() {
  return QUADS.reduce((next, q) => {
    next[q.id] = [];
    return next;
  }, {});
}

function getLocalDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTaskCount(tasks) {
  if (!isValidTasks(tasks)) return 0;
  return QUADS.reduce((total, q) => total + tasks[q.id].length, 0);
}

function getDoneCount(tasks) {
  if (!isValidTasks(tasks)) return 0;
  return QUADS.reduce((total, q) => total + tasks[q.id].filter(task => task.done).length, 0);
}

function hasAnyTasks(tasks) {
  return getTaskCount(tasks) > 0;
}

function getQuadCounts(tasks) {
  return QUADS.reduce((counts, q) => {
    counts[q.id] = Array.isArray(tasks?.[q.id]) ? tasks[q.id].length : 0;
    return counts;
  }, {});
}

function normalizeTasks(tasks) {
  const normalized = QUADS.reduce((next, q) => {
    next[q.id] = Array.isArray(tasks?.[q.id]) ? tasks[q.id] : [];
    return next;
  }, {});
  return orderAllTasksByDone(normalized);
}

function createHistoryEntry(dayKey, tasks, archivedAt = new Date().toISOString()) {
  const snapshot = normalizeTasks(tasks);
  return {
    id: dayKey,
    dayKey,
    archivedAt,
    total: getTaskCount(snapshot),
    done: getDoneCount(snapshot),
    counts: getQuadCounts(snapshot),
    tasks: snapshot,
  };
}

function normalizeHistoryEntry(entry) {
  if (!entry?.dayKey || !isValidTasks(entry.tasks)) return null;
  return createHistoryEntry(entry.dayKey, entry.tasks, entry.archivedAt || new Date().toISOString());
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeHistoryEntry)
    .filter(Boolean)
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
    .slice(0, MAX_HISTORY_DAYS);
}

function upsertHistoryEntry(history, entry) {
  return [entry, ...history.filter(item => item.dayKey !== entry.dayKey)]
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
    .slice(0, MAX_HISTORY_DAYS);
}

function parseDayKey(dayKey) {
  const [year, month, day] = String(dayKey).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatHistoryLongDate(dayKey) {
  const date = parseDayKey(dayKey);
  if (!date) return dayKey;
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getMonthKeyForDay(dayKey) {
  return String(dayKey).slice(0, 7);
}

function parseMonthKey(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return new Date();
  return new Date(year, month - 1, 1);
}

function addMonthsToKey(monthKey, offset) {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() + offset);
  return getMonthKey(date);
}

function formatMonthTitle(monthKey) {
  return parseMonthKey(monthKey).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getCalendarCells(monthKey) {
  const firstDay = parseMonthKey(monthKey);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dayKey = getLocalDayKey(date);
    return {
      dayKey,
      day: date.getDate(),
      inMonth: getMonthKey(date) === monthKey,
      isToday: dayKey === getLocalDayKey(),
      isFuture: dayKey > getLocalDayKey(),
    };
  });
}

function getHistoryEntryForDay(history, dayKey, activeDay, tasks) {
  if (dayKey === activeDay) return createHistoryEntry(dayKey, tasks);
  return history.find(entry => entry.dayKey === dayKey) || null;
}

function getVirtualDropSlots(list, qid, currentDragging, layouts = {}) {
  let cursor = 0;
  const slots = [];

  list.forEach(task => {
    if (currentDragging?.from === qid && currentDragging.task.id === task.id) return;
    const layout = layouts[task.id];
    const height = Math.max(1, Number.isFinite(layout?.height) ? layout.height : 42);
    slots.push({ task, top: cursor, height });
    cursor += height;
  });

  return { slots, totalHeight: cursor };
}

function constrainDropIndexByDone(slots, index, draggedTask) {
  const clampedIndex = Math.max(0, Math.min(slots.length, index));
  if (!draggedTask) return clampedIndex;

  const firstDoneIndex = slots.findIndex(slot => slot.task.done);
  const doneStart = firstDoneIndex === -1 ? slots.length : firstDoneIndex;

  return draggedTask.done
    ? Math.max(doneStart, clampedIndex)
    : Math.min(doneStart, clampedIndex);
}

function getMoveIndexFromMarker(list, qid, markerIndex, currentDragging) {
  let index = markerIndex;

  if (currentDragging?.from === qid) {
    const fromIndex = list.findIndex(task => task.id === currentDragging.task.id);
    if (fromIndex !== -1 && fromIndex < markerIndex) index -= 1;
  }

  const targetLength = currentDragging?.from === qid ? Math.max(0, list.length - 1) : list.length;
  return Math.max(0, Math.min(targetLength, index));
}

function clamp01(value) {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

function orderTasksByDone(list) {
  const active = [];
  const done = [];
  list.forEach(task => {
    if (task.done) done.push(task);
    else active.push(task);
  });
  return [...active, ...done];
}

function orderAllTasksByDone(tasks) {
  return QUADS.reduce((next, q) => {
    next[q.id] = orderTasksByDone(tasks[q.id] || []);
    return next;
  }, {});
}

function getDropGuideColor() {
  return DROP_GUIDE;
}

function getTaskDividerColor(quadId) {
  return TASK_DIVIDER_COLORS[quadId] || 'rgba(128,128,128,0.16)';
}

function CheckButton({ done, quadId, taskId, onPress }) {
  const color = COLORS[quadId];
  const idleBorder = quadId === 'q1' ? 'rgba(255,255,255,0.42)' : 'rgba(22,22,22,0.30)';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: done, disabled: false }}
      accessibilityLabel={done ? 'Mark incomplete' : 'Mark complete'}
      disabled={false}
      hitSlop={0}
      onPress={onPress}
      testID={`task-${taskId}-check`}
      style={styles.checkHit}
    >
      <View
        style={[
          styles.checkCircle,
          { borderColor: done ? color.check : idleBorder },
          done && { backgroundColor: color.check },
        ]}
      />
    </Pressable>
  );
}

const MiniTask = memo(function MiniTask({ task, quadId, isDragging, isLast, onEdit, onToggle, onBeginDrag, onDragMove, onEndDrag, onLayout }) {
  const longPressTimer = useRef(null);
  const didLongPress = useRef(false);
  const moved = useRef(false);
  const pressBlocked = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const isLongTask = task.text.length > LONG_TASK_TEXT_LENGTH;
  const isDoneVisual = task.done;
  const taskTextColor = isDoneVisual ? COLORS[quadId].done : COLORS[quadId].fg;
  const dividerColor = getTaskDividerColor(quadId);

  useEffect(() => () => clearTimeout(longPressTimer.current), []);

  const beginTouch = event => {
    const { pageX, pageY } = event.nativeEvent;
    didLongPress.current = false;
    moved.current = false;
    pressBlocked.current = false;
    start.current = { x: pageX, y: pageY };
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      pressBlocked.current = true;
      onBeginDrag(quadId, task, pageX, pageY);
    }, 360);
  };

  const moveTouch = event => {
    const { pageX, pageY } = event.nativeEvent;
    if (!didLongPress.current && (Math.abs(pageX - start.current.x) > 9 || Math.abs(pageY - start.current.y) > 9)) {
      moved.current = true;
      pressBlocked.current = true;
      clearTimeout(longPressTimer.current);
      return;
    }
    if (didLongPress.current) onDragMove(pageX, pageY);
  };

  const endTouch = cancelled => {
    clearTimeout(longPressTimer.current);
    if (didLongPress.current) {
      didLongPress.current = false;
      onEndDrag(cancelled);
      return;
    }
    if (cancelled || moved.current) pressBlocked.current = true;
  };

  const pressTask = () => {
    if (pressBlocked.current) return;
    onEdit(quadId, task);
  };

  return (
    <View
      testID={`task-${task.id}`}
      onLayout={onLayout}
      style={[
        styles.miniTask,
        !isLast && [styles.miniTaskDivider, { borderBottomColor: dividerColor }],
        isLongTask && styles.miniTaskRoomy,
        isDragging && styles.dragSource,
      ]}
    >
      <CheckButton done={task.done} quadId={quadId} taskId={task.id} onPress={onToggle} />
      <Pressable
        accessible
        accessibilityLabel={`Edit task: ${task.text}`}
        accessibilityRole="button"
        testID={`task-${task.id}-edit`}
        onPress={pressTask}
        onTouchCancel={() => endTouch(true)}
        onTouchEnd={() => endTouch(false)}
        onTouchMove={moveTouch}
        onTouchStart={beginTouch}
        style={[styles.miniDragArea, isLongTask && styles.miniDragAreaRoomy]}
      >
        <Text style={[styles.miniText, { color: taskTextColor }, isDoneVisual && styles.doneText]}>
          {task.text}
        </Text>
      </Pressable>
    </View>
  );
}, (prev, next) => (
  prev.task === next.task &&
  prev.quadId === next.quadId &&
  prev.isDragging === next.isDragging &&
  prev.isLast === next.isLast
));

const keyTask = task => String(task.id);

const QuadrantTile = memo(function QuadrantTile({
  q,
  color,
  tasks,
  topInset,
  dropMarkerTop,
  draggingTaskId,
  draggingActive,
  setQuadRef,
  setTaskAreaRef,
  setTaskListRef,
  onMeasure,
  onTaskScroll,
  onTaskContentSize,
  onTaskLayout,
  onOpenComposer,
  onToggleTask,
  onBeginDrag,
  onDragMove,
  onEndDrag,
}) {
  const isTopTile = q.id === 'q1' || q.id === 'q2';
  const isDropActive = dropMarkerTop !== null;
  const dropGuideColor = getDropGuideColor(q.id);
  const dropOverlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    dropOverlayAnim.stopAnimation();
    dropOverlayAnim.setValue(isDropActive ? 1 : 0);
  }, [dropOverlayAnim, isDropActive]);

  const renderTask = useCallback(({ item, index }) => (
    <MiniTask
      task={item}
      quadId={q.id}
      isDragging={draggingTaskId === item.id}
      isLast={index === tasks.length - 1}
      onEdit={onOpenComposer}
      onToggle={() => onToggleTask(q.id, item.id)}
      onBeginDrag={onBeginDrag}
      onDragMove={onDragMove}
      onEndDrag={onEndDrag}
      onLayout={event => onTaskLayout(q.id, item.id, event)}
    />
  ), [draggingTaskId, onBeginDrag, onDragMove, onEndDrag, onOpenComposer, onTaskLayout, onToggleTask, q.id, tasks.length]);

  const renderFooter = useCallback(() => (
    <Pressable
      accessible
      accessibilityLabel={`Add task to ${q.title}`}
      accessibilityRole="button"
      testID={`quadrant-${q.id}-empty-add-zone`}
      onPress={() => onOpenComposer(q.id)}
      style={styles.emptyAddZone}
    />
  ), [onOpenComposer, q.id, q.title]);

  return (
    <View
      testID={`quadrant-${q.id}`}
      ref={setQuadRef}
      collapsable={false}
      onLayout={onMeasure}
      style={[
        styles.tile,
        { backgroundColor: color.bg },
      ]}
    >
      <View style={[styles.tileHead, isTopTile && { paddingTop: 12 + topInset }]}>
        <View style={styles.tileHeadTop}>
          <Text style={[styles.tileTitle, { color: color.fg }]} numberOfLines={2}>{q.title}</Text>
        </View>
        <Text style={[styles.tileDesc, { color: color.muted }]}>{q.desc}</Text>
      </View>
      <View
        ref={setTaskAreaRef}
        collapsable={false}
        onLayout={onMeasure}
        style={styles.tileTasks}
      >
        <FlatList
          ref={setTaskListRef}
          data={tasks}
          keyExtractor={keyTask}
          renderItem={renderTask}
          ListFooterComponent={renderFooter}
          ListFooterComponentStyle={styles.emptyAddFooter}
          style={styles.tileList}
          contentContainerStyle={styles.tileTasksContent}
          onScroll={event => onTaskScroll(q.id, event.nativeEvent.contentOffset.y)}
          onContentSizeChange={(_, height) => onTaskContentSize(q.id, height)}
          scrollEventThrottle={16}
          scrollEnabled={!draggingActive}
          showsVerticalScrollIndicator={false}
          initialNumToRender={INITIAL_RENDER_TASKS}
          maxToRenderPerBatch={TASK_RENDER_BATCH}
          updateCellsBatchingPeriod={32}
          windowSize={LIST_WINDOW_SIZE}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          extraData={draggingTaskId || ''}
        />
        {dropMarkerTop !== null && (
          <View pointerEvents="none" style={[styles.dropInsertMarkerFloating, { top: Math.max(0, dropMarkerTop - 5) }]}>
            <View style={[styles.dropInsertLine, { backgroundColor: dropGuideColor }]} />
          </View>
        )}
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.dropOverlay,
          isTopTile && { top: topInset },
          { opacity: dropOverlayAnim },
        ]}
      >
        <View style={[styles.dropOverlayLine, styles.dropOverlayLineTop, { backgroundColor: dropGuideColor, borderColor: dropGuideColor }]} />
        <View style={[styles.dropOverlayLine, styles.dropOverlayLineRight, { backgroundColor: dropGuideColor, borderColor: dropGuideColor }]} />
        <View style={[styles.dropOverlayLine, styles.dropOverlayLineBottom, { backgroundColor: dropGuideColor, borderColor: dropGuideColor }]} />
        <View style={[styles.dropOverlayLine, styles.dropOverlayLineLeft, { backgroundColor: dropGuideColor, borderColor: dropGuideColor }]} />
      </Animated.View>
    </View>
  );
}, (prev, next) => (
  prev.tasks === next.tasks &&
  prev.topInset === next.topInset &&
  prev.dropMarkerTop === next.dropMarkerTop &&
  prev.draggingTaskId === next.draggingTaskId &&
  prev.draggingActive === next.draggingActive &&
  prev.q.id === next.q.id
));

function HistoryScreen({
  history,
  tasks,
  activeDay,
  onSelectDay,
}) {
  const [visibleMonth, setVisibleMonth] = useState(getMonthKeyForDay(activeDay));
  const cells = useMemo(() => getCalendarCells(visibleMonth), [visibleMonth]);
  const todayMonth = getMonthKey();
  const activeEntry = getHistoryEntryForDay(history, activeDay, activeDay, tasks);
  const canGoNext = visibleMonth < todayMonth;

  return (
    <SafeAreaView testID="history-screen" style={styles.historyScreen} edges={['top', 'right', 'bottom', 'left']}>
      <View style={styles.historyHeader}>
        <View style={styles.historyHeaderText}>
          <Text style={styles.historyTitle}>History</Text>
          <Text style={styles.historySubtitle}>
            {activeEntry.total > 0 ? `${formatHistoryLongDate(activeDay)} - ${activeEntry.total} tasks` : formatHistoryLongDate(activeDay)}
          </Text>
        </View>
      </View>
      <View style={styles.calendarShell}>
        <View style={styles.calendarMonthBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            testID="calendar-prev-month"
            onPress={() => setVisibleMonth(prev => addMonthsToKey(prev, -1))}
            style={({ pressed }) => [styles.calendarMonthButton, pressed && styles.historyPressed]}
          >
            <Ionicons name="chevron-back-outline" size={22} color={INK} />
          </Pressable>
          <Text style={styles.calendarMonthTitle}>{formatMonthTitle(visibleMonth)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            testID="calendar-next-month"
            disabled={!canGoNext}
            onPress={() => setVisibleMonth(prev => addMonthsToKey(prev, 1))}
            style={({ pressed }) => [styles.calendarMonthButton, !canGoNext && styles.calendarMonthButtonDisabled, pressed && canGoNext && styles.historyPressed]}
          >
            <Ionicons name="chevron-forward-outline" size={22} color={INK} />
          </Pressable>
        </View>
        <View style={styles.calendarWeekRow}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => (
            <Text key={`${label}-${index}`} style={styles.calendarWeekLabel}>{label}</Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {cells.map(cell => {
            const entry = getHistoryEntryForDay(history, cell.dayKey, activeDay, tasks);
            const hasEntry = !!entry;
            const hasTasks = (entry?.total || 0) > 0;
            const isActive = cell.dayKey === activeDay;
            const selectable = !cell.isFuture && (hasEntry || cell.isToday);

            return (
              <Pressable
                key={cell.dayKey}
                accessibilityRole="button"
                accessibilityLabel={`${formatHistoryLongDate(cell.dayKey)}${hasTasks ? `, ${entry.total} tasks` : ''}`}
                accessibilityState={{ selected: isActive, disabled: !selectable }}
                testID={`calendar-day-${cell.dayKey}`}
                disabled={!selectable}
                onPress={() => onSelectDay(cell.dayKey)}
                style={({ pressed }) => [
                  styles.calendarDay,
                  !cell.inMonth && styles.calendarDayMuted,
                  isActive && styles.calendarDayActive,
                  cell.isToday && !isActive && styles.calendarDayToday,
                  !selectable && styles.calendarDayDisabled,
                  pressed && selectable && styles.historyPressed,
                ]}
              >
                <Text style={[styles.calendarDayText, isActive && styles.calendarDayTextActive, !cell.inMonth && styles.calendarDayTextMuted]}>
                  {cell.day}
                </Text>
                {hasTasks && <View style={[styles.calendarTaskDot, isActive && styles.calendarTaskDotActive]} />}
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

function EisenhowerApp() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [fontsLoaded] = useFonts({
    Nunito_600SemiBold: require('@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf'),
    Nunito_700Bold: require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf'),
    Nunito_800ExtraBold: require('@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf'),
    Nunito_900Black: require('@expo-google-fonts/nunito/900Black/Nunito_900Black.ttf'),
  });
  const historyWidth = Math.min(windowWidth || 430, 430);
  const [tasks, setTasks] = useState(INIT);
  const [history, setHistory] = useState([]);
  const [activeDay, setActiveDay] = useState(getLocalDayKey());
  const [screen, setScreen] = useState('today');
  const [nextId, setNextId] = useState(getNextId(INIT));
  const [composer, setComposer] = useState(null);
  const [addVal, setAddVal] = useState('');
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [lastDeleted, setLastDeleted] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [shellHeight, setShellHeight] = useState(0);
  const shellHeightRef = useRef(0);
  const tasksRef = useRef(tasks);
  const shellRef = useRef(null);
  const trashRef = useRef(null);
  const quadRefs = useRef({});
  const shellRect = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const trashRect = useRef(null);
  const quadRects = useRef({});
  const taskAreaRefs = useRef({});
  const taskListRefs = useRef({});
  const taskAreaRects = useRef({});
  const taskContentHeights = useRef({});
  const taskLayouts = useRef({});
  const taskScrollOffsets = useRef({});
  const draggingRef = useRef(null);
  const dropTargetRef = useRef(null);
  const dropVisualRef = useRef(null);
  const dropIndexRef = useRef(null);
  const autoScrollFrame = useRef(null);
  const dragMoveFrame = useRef(null);
  const pendingDragPoint = useRef(null);
  const lastHitTestAt = useRef(0);
  const lastGhostPoint = useRef(null);
  const undoTimer = useRef(null);
  const persistTimer = useRef(null);
  const persistInteraction = useRef(null);
  const composerAnim = useRef(new Animated.Value(0)).current;
  const dragAnim = useRef(new Animated.Value(0)).current;
  const dragXAnim = useRef(new Animated.Value(0)).current;
  const dragYAnim = useRef(new Animated.Value(0)).current;
  const deleteHotAnim = useRef(new Animated.Value(0)).current;
  const trashAnim = useRef(new Animated.Value(0)).current;
  const undoAnim = useRef(new Animated.Value(0)).current;
  const historyProgress = useSharedValue(0);

  tasksRef.current = tasks;

  useEffect(() => {
    let mounted = true;

    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(HISTORY_KEY),
      AsyncStorage.getItem(ACTIVE_DAY_KEY),
    ])
      .then(([taskValue, historyValue, dayValue]) => {
        if (!mounted) return;
        const todayKey = getLocalDayKey();
        const storedTasks = taskValue ? JSON.parse(taskValue) : null;
        const storedHistory = historyValue ? JSON.parse(historyValue) : [];
        let nextHistory = normalizeHistory(storedHistory);
        const todayEntry = nextHistory.find(entry => entry.dayKey === todayKey);
        let nextTasks = isValidTasks(storedTasks)
          ? normalizeTasks(storedTasks)
          : todayEntry?.tasks || INIT;
        const storedDay = typeof dayValue === 'string' && dayValue ? dayValue : todayKey;

        if (storedDay !== todayKey) {
          if (isValidTasks(storedTasks) && hasAnyTasks(nextTasks)) {
            nextHistory = upsertHistoryEntry(nextHistory, createHistoryEntry(storedDay, nextTasks));
          }
          nextTasks = normalizeTasks(nextHistory.find(entry => entry.dayKey === todayKey)?.tasks || createEmptyTasks());
        }

        setTasks(nextTasks);
        setHistory(nextHistory);
        setActiveDay(todayKey);
        setNextId(getNextId(nextTasks));
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persistInteraction.current?.cancel?.();
      const taskPayload = JSON.stringify(tasks);
      const historyPayload = JSON.stringify(upsertHistoryEntry(history, createHistoryEntry(activeDay, tasks)));
      persistInteraction.current = InteractionManager.runAfterInteractions(() => {
        AsyncStorage.multiSet([
          [STORAGE_KEY, taskPayload],
          [HISTORY_KEY, historyPayload],
        ]).catch(() => {});
      });
    }, PERSIST_DELAY);
  }, [activeDay, history, loaded, tasks]);

  useEffect(() => {
    if (!loaded) return;
    InteractionManager.runAfterInteractions(() => {
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history)).catch(() => {});
    });
  }, [history, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(ACTIVE_DAY_KEY, activeDay).catch(() => {});
  }, [activeDay, loaded]);

  const archiveAndResetForNewDay = useCallback(() => {
    const todayKey = getLocalDayKey();
    if (activeDay === todayKey) return;
    const snapshot = tasksRef.current;
    let nextHistory = history;
    if (hasAnyTasks(snapshot)) {
      const entry = createHistoryEntry(activeDay, snapshot);
      nextHistory = upsertHistoryEntry(history, entry);
      setHistory(nextHistory);
    }
    setActiveDay(todayKey);
    const todayEntry = nextHistory.find(entry => entry.dayKey === todayKey);
    const nextTasks = todayEntry ? normalizeTasks(todayEntry.tasks) : createEmptyTasks();
    setTasks(nextTasks);
    setNextId(getNextId(nextTasks));
    setLastDeleted(null);
    clearTimeout(undoTimer.current);
  }, [activeDay, history]);

  useEffect(() => {
    if (!loaded) return undefined;
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') archiveAndResetForNewDay();
    });
    return () => subscription.remove();
  }, [archiveAndResetForNewDay, loaded]);

  useEffect(() => {
    trashAnim.stopAnimation();
    trashAnim.setValue(dragging ? 1 : 0);
  }, [dragging, trashAnim]);

  useEffect(() => {
    deleteHotAnim.stopAnimation();
    deleteHotAnim.setValue(dropTarget === 'trash' ? 1 : 0);
  }, [deleteHotAnim, dropTarget]);

  useEffect(() => {
    if (!lastDeleted || dragging) {
      undoAnim.setValue(0);
      return;
    }
    Animated.timing(undoAnim, {
      toValue: 1,
      duration: MOTION.enter,
      easing: MOTION.out,
      useNativeDriver: true,
    }).start();
  }, [dragging, lastDeleted, undoAnim]);

  useEffect(() => () => {
    clearTimeout(undoTimer.current);
    clearTimeout(persistTimer.current);
    persistInteraction.current?.cancel?.();
    if (autoScrollFrame.current) cancelAnimationFrame(autoScrollFrame.current);
    if (dragMoveFrame.current) cancelAnimationFrame(dragMoveFrame.current);
  }, []);

  const measureTargets = () => {
    shellRef.current?.measureInWindow((x, y, width, height) => {
      shellRect.current = { x, y, width, height };
    });
    trashRef.current?.measureInWindow((x, y, width, height) => {
      trashRect.current = {
        x,
        y,
        width,
        height,
      };
    });
    QUADS.forEach(q => {
      quadRefs.current[q.id]?.measureInWindow((x, y, width, height) => {
        quadRects.current[q.id] = { x, y, width, height };
      });
      taskAreaRefs.current[q.id]?.measureInWindow((x, y, width, height) => {
        taskAreaRects.current[q.id] = { x, y, width, height };
      });
    });
  };

  const handleShellLayout = event => {
    const { height } = event.nativeEvent.layout;
    if (height > 0 && height > shellHeightRef.current) {
      shellHeightRef.current = height;
      setShellHeight(height);
    }
    measureTargets();
  };

  const targetAt = (x, y) => {
    const trash = trashRect.current;
    if (trash && x >= trash.x && x <= trash.x + trash.width && y >= trash.y && y <= trash.y + trash.height) {
      return { type: 'trash' };
    }
    const quad = QUADS.find(q => {
      const rect = quadRects.current[q.id];
      return rect && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    });
    if (!quad) return null;
    const taskArea = taskAreaRects.current[quad.id] || quadRects.current[quad.id];
    const scrollOffset = taskScrollOffsets.current[quad.id] || 0;
    const relativeY = Math.max(0, y - taskArea.y + scrollOffset);
    const layouts = taskLayouts.current[quad.id] || {};
    const list = tasksRef.current[quad.id] || [];
    const { slots } = getVirtualDropSlots(list, quad.id, null, layouts);
    let markerIndex = slots.length;

    for (let i = 0; i < slots.length; i += 1) {
      if (relativeY < slots[i].top + slots[i].height / 2) {
        markerIndex = i;
        break;
      }
    }

    markerIndex = constrainDropIndexByDone(slots, markerIndex, draggingRef.current?.task);
    const index = getMoveIndexFromMarker(list, quad.id, markerIndex, draggingRef.current);

    return { type: 'quad', qid: quad.id, index, markerIndex };
  };

  const resolveDragTarget = (x, y, force = false) => {
    const now = Date.now();
    if (!force && now - lastHitTestAt.current < DROP_HIT_TEST_INTERVAL) {
      return dropTargetRef.current;
    }

    lastHitTestAt.current = now;
    return targetAt(x, y);
  };

  const setActiveDropTarget = target => {
    const nextDropTarget = target?.type === 'trash' ? 'trash' : target?.qid || null;
    const nextDropIndex = target?.type === 'quad' ? target.markerIndex : null;

    dropTargetRef.current = target;

    if (dropVisualRef.current !== nextDropTarget) {
      dropVisualRef.current = nextDropTarget;
      setDropTarget(nextDropTarget);
    }

    if (dropIndexRef.current !== nextDropIndex) {
      dropIndexRef.current = nextDropIndex;
      setDropIndex(nextDropIndex);
    }
  };

  const canAutoScroll = (target, y) => {
    if (target?.type !== 'quad') return false;
    const area = taskAreaRects.current[target.qid];
    const contentHeight = taskContentHeights.current[target.qid] || 0;
    const viewHeight = area?.height || 0;
    const maxOffset = Math.max(0, contentHeight - viewHeight);
    if (!area || maxOffset <= 0) return false;
    return y < area.y + AUTO_SCROLL_EDGE || y > area.y + area.height - AUTO_SCROLL_EDGE;
  };

  const stopAutoScroll = () => {
    if (!autoScrollFrame.current) return;
    cancelAnimationFrame(autoScrollFrame.current);
    autoScrollFrame.current = null;
  };

  const runAutoScroll = () => {
    const current = draggingRef.current;
    if (!current) {
      stopAutoScroll();
      return;
    }

    const target = dropTargetRef.current;

    if (target?.type === 'quad') {
      const qid = target.qid;
      const area = taskAreaRects.current[qid];
      const contentHeight = taskContentHeights.current[qid] || 0;
      const viewHeight = area?.height || 0;
      const maxOffset = Math.max(0, contentHeight - viewHeight);

      if (area && maxOffset > 0) {
        const currentOffset = taskScrollOffsets.current[qid] || 0;
        let delta = 0;

        if (current.y < area.y + AUTO_SCROLL_EDGE) {
          const intensity = Math.min(1, Math.max(0, (area.y + AUTO_SCROLL_EDGE - current.y) / AUTO_SCROLL_EDGE));
          delta = -Math.ceil(2 + intensity * 7);
        } else if (current.y > area.y + area.height - AUTO_SCROLL_EDGE) {
          const intensity = Math.min(1, Math.max(0, (current.y - (area.y + area.height - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE));
          delta = Math.ceil(2 + intensity * 7);
        }

        if (delta !== 0) {
          const nextOffset = Math.max(0, Math.min(maxOffset, currentOffset + delta));
          if (nextOffset !== currentOffset) {
            taskScrollOffsets.current[qid] = nextOffset;
            taskListRefs.current[qid]?.scrollToOffset({ offset: nextOffset, animated: false });
            setActiveDropTarget(resolveDragTarget(current.x, current.y));
          }
        }
      }
    }

    if (canAutoScroll(dropTargetRef.current, current.y)) {
      autoScrollFrame.current = requestAnimationFrame(runAutoScroll);
    } else {
      stopAutoScroll();
    }
  };

  const syncAutoScroll = target => {
    const current = draggingRef.current;
    if (!current || !canAutoScroll(target, current.y)) {
      stopAutoScroll();
      return;
    }
    if (autoScrollFrame.current) return;
    stopAutoScroll();
    autoScrollFrame.current = requestAnimationFrame(runAutoScroll);
  };

  const mountHistoryForGesture = useCallback(() => {
    Keyboard.dismiss();
    setScreen('history');
  }, []);

  const finishCloseHistory = useCallback(() => {
    setScreen('today');
  }, []);

  const closeHistory = useCallback((animated = true) => {
    if (!animated) {
      historyProgress.value = 0;
      finishCloseHistory();
      return;
    }
    historyProgress.value = withTiming(0, { duration: MOTION.exit }, finished => {
      if (finished) runOnJS(finishCloseHistory)();
    });
  }, [finishCloseHistory, historyProgress]);

  const openHistoryGesture = useMemo(() => Gesture.Pan()
    .enabled(screen === 'today' && !dragging && !composer)
    .activeOffsetX([-9999, 10])
    .failOffsetY([-24, 24])
    .onStart(() => {
      historyProgress.value = 0;
      runOnJS(mountHistoryForGesture)();
    })
    .onUpdate(event => {
      historyProgress.value = clamp01(event.translationX / HISTORY_OPEN_TRIGGER);
    })
    .onEnd(event => {
      const shouldOpen = historyProgress.value > 0.42 || event.velocityX > 520;
      historyProgress.value = withTiming(shouldOpen ? 1 : 0, { duration: shouldOpen ? MOTION.enter : MOTION.exit }, finished => {
        if (finished && !shouldOpen) runOnJS(finishCloseHistory)();
      });
    }), [composer, dragging, finishCloseHistory, historyProgress, mountHistoryForGesture, screen]);

  const closeHistoryGesture = useMemo(() => Gesture.Pan()
    .enabled(screen === 'history')
    .activeOffsetX([-10, 9999])
    .failOffsetY([-24, 24])
    .onUpdate(event => {
      historyProgress.value = clamp01(1 + event.translationX / HISTORY_CLOSE_TRIGGER);
    })
    .onEnd(event => {
      const shouldClose = historyProgress.value < 0.58 || event.velocityX < -520;
      historyProgress.value = withTiming(shouldClose ? 0 : 1, { duration: shouldClose ? MOTION.exit : MOTION.enter }, finished => {
        if (finished && shouldClose) runOnJS(finishCloseHistory)();
      });
    }), [finishCloseHistory, historyProgress, screen]);

  const historyScreenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -historyWidth * (1 - historyProgress.value) }],
  }));

  const openComposer = (qid, task = null) => {
    composerAnim.stopAnimation();
    setComposer({ qid, taskId: task?.id || null });
    setAddVal(task?.text || '');
    composerAnim.setValue(0);
    Animated.timing(composerAnim, {
      toValue: 1,
      duration: MOTION.enter,
      easing: MOTION.out,
      useNativeDriver: true,
    }).start();
  };

  const closeComposer = (animated = true) => {
    if (!composer) return;
    const finish = () => {
      setComposer(null);
      setAddVal('');
      Keyboard.dismiss();
    };
    composerAnim.stopAnimation();
    if (!animated) {
      composerAnim.setValue(0);
      finish();
      return;
    }
    Animated.timing(composerAnim, {
      toValue: 0,
      duration: MOTION.exit,
      easing: MOTION.in,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) finish();
    });
  };

  const selectHistoryDay = useCallback(dayKey => {
    const nextHistory = upsertHistoryEntry(history, createHistoryEntry(activeDay, tasksRef.current));
    const entry = getHistoryEntryForDay(nextHistory, dayKey, activeDay, tasksRef.current);
    const nextTasks = entry ? normalizeTasks(entry.tasks) : createEmptyTasks();
    setHistory(nextHistory);
    setActiveDay(dayKey);
    setTasks(nextTasks);
    setNextId(getNextId(nextTasks));
    setLastDeleted(null);
    clearTimeout(undoTimer.current);
    closeHistory();
  }, [activeDay, closeHistory, history]);

  const toggleTask = (qid, tid) => {
    setTasks(prev => ({
      ...prev,
      [qid]: orderTasksByDone(prev[qid].map(task => task.id === tid ? { ...task, done: !task.done } : task)),
    }));
  };

  const deleteTask = (qid, tid) => {
    setTasks(prev => {
      const index = prev[qid].findIndex(task => task.id === tid);
      if (index === -1) return prev;
      const task = prev[qid][index];
      setLastDeleted({ qid, task, index });
      clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setLastDeleted(null), 4500);
      return { ...prev, [qid]: prev[qid].filter(item => item.id !== tid) };
    });
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    setTasks(prev => {
      const list = [...prev[lastDeleted.qid]];
      list.splice(lastDeleted.index, 0, lastDeleted.task);
      return { ...prev, [lastDeleted.qid]: orderTasksByDone(list) };
    });
    clearTimeout(undoTimer.current);
    setLastDeleted(null);
  };

  const moveTask = (from, tid, to, toIndex) => {
    setTasks(prev => {
      const fromList = prev[from];
      const fromIndex = fromList.findIndex(item => item.id === tid);
      if (fromIndex === -1) return prev;
      const task = fromList[fromIndex];
      const nextFrom = fromList.filter(item => item.id !== tid);
      const nextToBase = from === to ? nextFrom : [...prev[to]];
      let insertAt = Number.isInteger(toIndex) ? toIndex : nextToBase.length;
      insertAt = Math.max(0, Math.min(nextToBase.length, insertAt));
      const nextTo = [...nextToBase];
      nextTo.splice(insertAt, 0, task);
      return {
        ...prev,
        [from]: from === to ? orderTasksByDone(nextTo) : orderTasksByDone(nextFrom),
        ...(from === to ? {} : { [to]: orderTasksByDone(nextTo) }),
      };
    });
  };

  const saveComposer = () => {
    const text = addVal.trim();
    if (!text || !composer) return;
    if (composer.taskId) {
      setTasks(prev => ({
        ...prev,
        [composer.qid]: prev[composer.qid].map(task => task.id === composer.taskId ? { ...task, text } : task),
      }));
    } else {
      const id = nextId;
      setTasks(prev => ({ ...prev, [composer.qid]: orderTasksByDone([...prev[composer.qid], { id, text, done: false }]) }));
      setNextId(id + 1);
    }
    closeComposer();
  };

  const handleComposerBackdropPress = () => {
    if (addVal.trim()) {
      saveComposer();
      return;
    }
    closeComposer();
  };

  const getDragGhostMetrics = (x, y) => {
    const rect = shellRect.current;
    const width = Math.max(132, Math.min(172, (rect.width || 430) / 2 - 28));
    return {
      width,
      left: Math.max(12, Math.min(x - (rect.x || 0) - width / 2, (rect.width || 430) - width - 12)),
      top: Math.max(10, y - (rect.y || 0) + 24),
    };
  };

  const moveDragGhostTo = (x, y, immediate = false) => {
    const lastPoint = lastGhostPoint.current;
    if (
      !immediate &&
      lastPoint &&
      Math.abs(x - lastPoint.x) < DRAG_POINT_EPSILON &&
      Math.abs(y - lastPoint.y) < DRAG_POINT_EPSILON
    ) {
      return;
    }

    lastGhostPoint.current = { x, y };
    const { left, top } = getDragGhostMetrics(x, y);

    dragXAnim.setValue(left);
    dragYAnim.setValue(top);
  };

  const applyDragPoint = (x, y) => {
    const current = draggingRef.current;
    if (!current) return;
    const next = { ...current, x, y };
    const target = resolveDragTarget(x, y);
    draggingRef.current = next;
    setActiveDropTarget(target);
    syncAutoScroll(target);
    moveDragGhostTo(x, y);
  };

  const flushPendingDragPoint = () => {
    dragMoveFrame.current = null;
    const point = pendingDragPoint.current;
    pendingDragPoint.current = null;
    if (!point) return;
    applyDragPoint(point.x, point.y);
  };

  const beginDrag = (from, task, x, y) => {
    closeComposer(false);
    measureTargets();
    lastHitTestAt.current = 0;
    lastGhostPoint.current = null;
    const next = { from, task, x, y };
    draggingRef.current = next;
    const target = resolveDragTarget(x, y, true);
    setActiveDropTarget(target);
    moveDragGhostTo(x, y, true);
    dragAnim.stopAnimation();
    dragAnim.setValue(1);
    setDragging(next);
    syncAutoScroll(target);
  };

  const updateDrag = (x, y) => {
    pendingDragPoint.current = { x, y };
    if (dragMoveFrame.current) return;
    dragMoveFrame.current = requestAnimationFrame(flushPendingDragPoint);
  };

  const endDrag = cancelled => {
    if (dragMoveFrame.current) {
      cancelAnimationFrame(dragMoveFrame.current);
      dragMoveFrame.current = null;
    }
    if (pendingDragPoint.current) {
      const { x, y } = pendingDragPoint.current;
      pendingDragPoint.current = null;
      applyDragPoint(x, y);
    }

    const current = draggingRef.current;
    if (!current) return;
    const target = cancelled ? dropTargetRef.current : resolveDragTarget(current.x, current.y, true);
    stopAutoScroll();
    draggingRef.current = null;
    dropTargetRef.current = null;
    lastGhostPoint.current = null;

    if (!cancelled && target?.type === 'trash') {
      deleteTask(current.from, current.task.id);
    } else if (!cancelled && target?.type === 'quad') {
      moveTask(current.from, current.task.id, target.qid, target.index);
    }

    dragAnim.stopAnimation();
    dragAnim.setValue(0);
    setDragging(null);
    dropVisualRef.current = null;
    dropIndexRef.current = null;
    setDropTarget(null);
    setDropIndex(null);
  };

  if (!fontsLoaded) {
    return <View style={styles.loading} />;
  }

  const activeComposer = composer ? QUADS.find(q => q.id === composer.qid) : null;
  const activeComposerColor = composer ? COLORS[composer.qid] : null;
  const composerMode = composer?.taskId ? 'Edit task' : 'New task';
  const displayHistory = useMemo(() => (
    upsertHistoryEntry(history, createHistoryEntry(activeDay, tasks))
  ), [activeDay, history, tasks]);
  const shellWidth = shellRect.current.width || Math.min(windowWidth || 430, 430);
  const dragGhostWidth = Math.max(132, Math.min(172, shellWidth / 2 - 28));

  const getDropMarkerTop = (qid, index) => {
    if (!Number.isInteger(index)) return null;

    const layouts = taskLayouts.current[qid] || {};
    const scrollOffset = taskScrollOffsets.current[qid] || 0;
    const { slots, totalHeight } = getVirtualDropSlots(tasks[qid] || [], qid, null, layouts);
    const clampedIndex = constrainDropIndexByDone(slots, index, dragging?.task);

    if (slots.length === 0) return 0;

    if (clampedIndex <= 0) {
      return Math.max(0, slots[0].top - scrollOffset);
    }

    if (clampedIndex >= slots.length) {
      return Math.max(0, totalHeight - scrollOffset);
    }

    return Math.max(0, slots[clampedIndex].top - scrollOffset);
  };

  return (
    <View style={styles.root}>
      <StatusBar style={screen === 'history' ? 'dark' : 'light'} backgroundColor="transparent" translucent />
      <View
        ref={shellRef}
        collapsable={false}
        onLayout={handleShellLayout}
        style={[styles.shell, shellHeight > 0 && { minHeight: shellHeight }]}
      >
        <GestureDetector gesture={openHistoryGesture}>
          <View testID="matrix-gesture-layer" style={styles.safeLayer}>
            <View style={styles.grid}>
              {QUADS.map(q => (
                <QuadrantTile
                  key={q.id}
                  q={q}
                  color={COLORS[q.id]}
                  tasks={tasks[q.id]}
                  topInset={insets.top}
                  dropMarkerTop={dropTarget === q.id ? getDropMarkerTop(q.id, dropIndex) : null}
                  draggingTaskId={dragging?.task.id || null}
                  draggingActive={!!dragging}
                  setQuadRef={node => { quadRefs.current[q.id] = node; }}
                  setTaskAreaRef={node => { taskAreaRefs.current[q.id] = node; }}
                  setTaskListRef={node => { taskListRefs.current[q.id] = node; }}
                  onMeasure={measureTargets}
                  onTaskScroll={(qid, offset) => {
                    taskScrollOffsets.current[qid] = offset;
                  }}
                  onTaskContentSize={(qid, height) => {
                    taskContentHeights.current[qid] = height;
                  }}
                  onTaskLayout={(qid, taskId, event) => {
                    const { y, height } = event.nativeEvent.layout;
                    if (!taskLayouts.current[qid]) taskLayouts.current[qid] = {};
                    taskLayouts.current[qid][taskId] = { y, height };
                  }}
                  onOpenComposer={openComposer}
                  onToggleTask={toggleTask}
                  onBeginDrag={beginDrag}
                  onDragMove={updateDrag}
                  onEndDrag={endDrag}
                />
              ))}
            </View>

            <Animated.View
              ref={trashRef}
              collapsable={false}
              pointerEvents="none"
              style={[
                styles.deleteTarget,
                {
                  opacity: trashAnim,
                  height: DELETE_TARGET_HEIGHT + insets.bottom,
                  transform: [{ translateY: trashAnim.interpolate({ inputRange: [0, 1], outputRange: [DELETE_TARGET_HEIGHT + insets.bottom, 0] }) }],
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.trashDrop,
                  {
                    transform: [{ scaleY: deleteHotAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
                  },
                ]}
              >
                <Animated.View style={[styles.trashDropHot, { opacity: deleteHotAnim }]} />
              </Animated.View>
            </Animated.View>

            {lastDeleted && !dragging && (
              <Animated.View
                accessibilityRole="alert"
                style={[
                  styles.undo,
                  {
                    bottom: 14 + insets.bottom,
                    opacity: undoAnim,
                    transform: [{ translateY: undoAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
                  },
                ]}
              >
                <Text style={styles.undoText}>Task deleted</Text>
                <Pressable onPress={undoDelete} style={styles.undoButton}>
                  <Text style={styles.undoButtonText}>Undo</Text>
                </Pressable>
              </Animated.View>
            )}

          </View>
        </GestureDetector>

        {screen === 'history' && (
          <GestureDetector gesture={closeHistoryGesture}>
            <Reanimated.View testID="history-slide" style={[styles.historySlide, historyScreenStyle]}>
              <HistoryScreen
                history={displayHistory}
                tasks={tasks}
                activeDay={activeDay}
                onSelectDay={selectHistoryDay}
              />
            </Reanimated.View>
          </GestureDetector>
        )}

        {dragging && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.dragGhost,
              {
                backgroundColor: COLORS[dragging.from].bg,
                width: dragGhostWidth,
                left: 0,
                top: 0,
                opacity: dragAnim,
                transform: [
                  { translateX: dragXAnim },
                  { translateY: dragYAnim },
                  { scale: dragAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
                borderColor: 'rgba(22,22,22,0.08)',
              },
            ]}
          >
            <Text style={[styles.dragGhostText, { color: COLORS[dragging.from].fg }]} numberOfLines={2} ellipsizeMode="tail">{dragging.task.text}</Text>
          </Animated.View>
        )}

        {composer && activeComposer && (
          <SafeAreaView testID="task-composer" style={styles.composerSafe} edges={['top', 'right', 'left']}>
            <AnimatedPressable
              accessibilityLabel="Close task editor"
              testID="task-composer-backdrop"
              onPress={handleComposerBackdropPress}
              style={[
                styles.composerBackdrop,
                { opacity: composerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
              ]}
            />
            <KeyboardStickyView
              pointerEvents="box-none"
              offset={{ closed: 0, opened: -COMPOSER_KEYBOARD_GAP }}
              style={styles.composerKeyboard}
            >
              <Animated.View
                testID="task-composer-panel"
                style={[
                  styles.composerPanel,
                  {
                    opacity: composerAnim,
                    transform: [{ translateY: composerAnim.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
                  },
                  composerPanelBg(composer.qid),
                  composerBorder(composer.qid),
                ]}
              >
                <Text style={[styles.composerTitle, { color: activeComposerColor.fg }]}>{composerMode}</Text>
                <Text style={[styles.composerDesc, { color: activeComposerColor.muted }]}>{activeComposer.desc}</Text>
                <View style={styles.composerRow}>
                  <TextInput
                    accessibilityLabel="Task name"
                    testID="task-composer-input"
                    value={addVal}
                    onChangeText={setAddVal}
                    onSubmitEditing={saveComposer}
                    placeholder="Task name..."
                    placeholderTextColor={composer.qid === 'q1' ? 'rgba(255,255,255,0.38)' : 'rgba(22,22,22,0.42)'}
                    returnKeyType="done"
                    style={[styles.addInput, addInputBg(composer.qid), { color: activeComposerColor.fg }]}
                    autoFocus
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={composer.taskId ? 'Save task' : 'Add task'}
                    testID="task-composer-save"
                    disabled={!addVal.trim()}
                    onPress={saveComposer}
                    style={({ pressed }) => [
                      styles.addButton,
                      addButtonBg(composer.qid),
                      pressed && addVal.trim() && styles.pressed,
                      !addVal.trim() && styles.addButtonDisabled,
                    ]}
                  >
                    <Text style={styles.addButtonText}>Save</Text>
                  </Pressable>
                </View>
              </Animated.View>
            </KeyboardStickyView>
          </SafeAreaView>
        )}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.appRoot}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <EisenhowerApp />
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function composerPanelBg(quadId) {
  return { backgroundColor: COLORS[quadId].bg };
}

function composerBorder(quadId) {
  if (quadId === 'q1') return { borderColor: 'rgba(255,255,255,0.16)' };
  return { borderColor: 'rgba(22,22,22,0.08)' };
}

function addInputBg(quadId) {
  if (quadId === 'q1') return { backgroundColor: 'rgba(255,255,255,0.1)' };
  return { backgroundColor: 'rgba(22,22,22,0.06)' };
}

function addButtonBg(quadId) {
  if (quadId === 'q1') return { backgroundColor: 'rgba(255,255,255,0.16)' };
  return { backgroundColor: INK };
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: INK,
    alignItems: 'center',
  },
  loading: {
    flex: 1,
    backgroundColor: APP_SURFACE,
  },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
    backgroundColor: APP_SURFACE,
    overflow: 'hidden',
  },
  safeLayer: {
    flex: 1,
    position: 'relative',
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: APP_SURFACE,
  },
  tile: {
    width: '50%',
    height: '50%',
    overflow: 'hidden',
    borderWidth: 0,
  },
  dropOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  dropOverlayLine: {
    position: 'absolute',
    borderColor: INK,
    backgroundColor: INK,
  },
  dropOverlayLineTop: {
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  dropOverlayLineRight: {
    top: 0,
    right: 0,
    bottom: 0,
    width: 2,
  },
  dropOverlayLineBottom: {
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
  },
  dropOverlayLineLeft: {
    top: 0,
    left: 0,
    bottom: 0,
    width: 2,
  },
  dropInsertMarkerFloating: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 10,
    justifyContent: 'center',
    zIndex: 4,
  },
  dropInsertLine: {
    height: 2.5,
    borderRadius: 1,
    backgroundColor: INK,
  },
  pressed: {
    opacity: 0.72,
  },
  tileHead: {
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 7,
  },
  tileHeadTop: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  tileTitle: {
    flex: 1,
    ...TYPE.tileTitle,
  },
  tileDesc: {
    ...TYPE.tileMeta,
    marginTop: 2,
  },
  tileTasks: {
    flex: 1,
  },
  tileList: {
    flex: 1,
  },
  tileTasksContent: {
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  miniTask: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniTaskDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.16)',
  },
  miniTaskRoomy: {
    paddingVertical: 4,
  },
  dragSource: {
    opacity: 0.24,
  },
  checkHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircle: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniText: {
    width: '100%',
    paddingRight: 7,
    ...TYPE.task,
    textAlignVertical: 'center',
  },
  miniDragArea: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  miniDragAreaRoomy: {
    paddingVertical: 2,
  },
  doneText: {
    textDecorationLine: 'line-through',
  },
  tileEmpty: {
    display: 'none',
  },
  emptyAddFooter: {
    flexGrow: 1,
  },
  emptyAddZone: {
    flex: 1,
    minHeight: 78,
  },
  deleteTarget: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  trashDrop: {
    width: '100%',
    height: DELETE_BAR_HEIGHT,
    backgroundColor: DANGER_SOFT,
    overflow: 'hidden',
  },
  trashDropHot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: DANGER,
  },
  dragGhost: {
    position: 'absolute',
    zIndex: 25,
    width: 240,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
    shadowColor: INK,
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  dragGhostText: {
    ...TYPE.dragLabel,
  },
  undo: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: INK,
    paddingLeft: 15,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 30,
  },
  undoText: {
    color: '#fff',
    ...TYPE.button,
  },
  undoButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoButtonText: {
    color: INK,
    ...TYPE.button,
  },
  historySlide: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 34,
    elevation: 8,
  },
  historyScreen: {
    flex: 1,
    backgroundColor: APP_SURFACE,
  },
  historyHeader: {
    minHeight: 88,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(22,22,22,0.08)',
  },
  historyHeaderText: {
    flex: 1,
  },
  historyTitle: {
    color: INK,
    ...TYPE.screenTitle,
  },
  historySubtitle: {
    marginTop: 1,
    color: 'rgba(22,22,22,0.52)',
    ...TYPE.screenSubtitle,
  },
  historyPressed: {
    opacity: 0.68,
  },
  calendarShell: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 24,
  },
  calendarMonthBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarMonthButton: {
    width: 46,
    height: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthButtonDisabled: {
    opacity: 0.24,
  },
  calendarMonthTitle: {
    flex: 1,
    color: INK,
    ...TYPE.rowTitle,
    textAlign: 'center',
  },
  calendarWeekRow: {
    marginTop: 12,
    flexDirection: 'row',
  },
  calendarWeekLabel: {
    width: `${100 / 7}%`,
    color: 'rgba(22,22,22,0.48)',
    ...TYPE.sectionLabel,
    textAlign: 'center',
  },
  calendarGrid: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: `${100 / 7}%`,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginVertical: 3,
  },
  calendarDayActive: {
    backgroundColor: INK,
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: DROP_GUIDE,
  },
  calendarDayMuted: {
    opacity: 0.34,
  },
  calendarDayDisabled: {
    opacity: 0.22,
  },
  calendarDayText: {
    color: INK,
    ...TYPE.rowMeta,
  },
  calendarDayTextActive: {
    color: '#FFFFFF',
  },
  calendarDayTextMuted: {
    color: 'rgba(22,22,22,0.44)',
  },
  calendarTaskDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
    backgroundColor: INK,
  },
  calendarTaskDotActive: {
    backgroundColor: '#FFFFFF',
  },
  composerSafe: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 16,
  },
  composerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22,22,22,0.10)',
  },
  composerKeyboard: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  composerPanel: {
    marginHorizontal: 10,
    marginBottom: COMPOSER_BOTTOM_GAP,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    width: 'auto',
    shadowColor: INK,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  composerTitle: {
    ...TYPE.composerTitle,
  },
  composerDesc: {
    ...TYPE.composerMeta,
    marginTop: 1,
    marginBottom: 10,
  },
  composerRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 9,
  },
  addInput: {
    width: '100%',
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    ...TYPE.input,
  },
  addButton: {
    width: '100%',
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.32,
  },
  addButtonText: {
    color: '#fff',
    ...TYPE.button,
  },
});
