import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  InteractionManager,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  KeyboardProvider,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const STORAGE_KEY = "eisenhower-mobile.tasks.v1";
const HISTORY_KEY = "eisenhower-mobile.history.v1";
const ACTIVE_DAY_KEY = "eisenhower-mobile.activeDay.v1";
const ARCHIVE_SWIPE_EDGE = 28;
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
const INK = "#161616";
const APP_SURFACE = "#F7F7F4";
const PANEL_SURFACE = "#FAFAF8";
const HAIRLINE_DARK = "rgba(22,22,22,0.12)";
const DROP_GUIDE = "#F4C430";
const DANGER = "#D94A3A";
// splash-icon.png: 1024x1024 canvas, grid is center 512x512 (50%), corner radius 115px within grid
// So visual grid = Math.min(W,H) * 0.5, corner radius = 115/512 of grid size
const SPLASH_GRID_RATIO = 0.5;
const SPLASH_RADIUS_RATIO = 115 / 512;
const DANGER_SOFT = "rgba(217,74,58,0.16)";

const TYPE = {
  screenTitle: { fontFamily: "Nunito_900Black", fontSize: 26, lineHeight: 32 },
  screenSubtitle: {
    fontFamily: "Nunito_700Bold",
    fontSize: 11.5,
    lineHeight: 16,
  },
  sectionLabel: {
    fontFamily: "Nunito_900Black",
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  rowTitle: { fontFamily: "Nunito_900Black", fontSize: 15, lineHeight: 19 },
  rowMeta: { fontFamily: "Nunito_700Bold", fontSize: 10.5, lineHeight: 14 },
  tileTitle: {
    fontFamily: "Nunito_800ExtraBold",
    fontSize: 14,
    lineHeight: 17,
  },
  tileMeta: { fontFamily: "Nunito_700Bold", fontSize: 9.5, lineHeight: 12.5 },
  task: { fontFamily: "Nunito_600SemiBold", fontSize: 11.5, lineHeight: 16 },
  dragLabel: {
    fontFamily: "Nunito_800ExtraBold",
    fontSize: 12,
    lineHeight: 16,
  },
  button: { fontFamily: "Nunito_900Black", fontSize: 12, lineHeight: 16 },
  smallButton: { fontFamily: "Nunito_900Black", fontSize: 11, lineHeight: 15 },
  composerTitle: {
    fontFamily: "Nunito_800ExtraBold",
    fontSize: 15,
    lineHeight: 19,
  },
  composerMeta: {
    fontFamily: "Nunito_700Bold",
    fontSize: 10.5,
    lineHeight: 14,
  },
  input: { fontFamily: "Nunito_600SemiBold", fontSize: 14, lineHeight: 18 },
};

const MOTION = {
  exit: 180,
  quick: 100,
  // Smooth decelerate (starts fast, trails naturally) — for timing-based exits
  out: Easing.bezier(0.25, 0.1, 0.25, 1),
  // Accelerate (clean exit) — for timing-based closes
  in: Easing.bezier(0.42, 0, 1, 1),
  // Spring configs for enters — physical deceleration, no bounce
  spring: { tension: 180, friction: 26, overshootClamping: true, useNativeDriver: true },
  springPanel: { tension: 80, friction: 14, overshootClamping: true, useNativeDriver: true },
  springFast: { tension: 260, friction: 28, overshootClamping: true, useNativeDriver: true },
};

const QUADS = [
  { id: "q1", title: "Do Now", desc: "Urgent - Important" },
  { id: "q2", title: "Schedule", desc: "Important - Not urgent" },
  { id: "q3", title: "Delegate", desc: "Urgent - Not important" },
  { id: "q4", title: "Eliminate", desc: "Not urgent - Not important" },
];

const INIT = {
  q1: [{ id: 1, text: "Reply to the urgent email", done: false }],
  q2: [
    { id: 2, text: "Read the strategy book", done: false },
    { id: 3, text: "Write the quarterly plan", done: false },
  ],
  q3: [{ id: 4, text: "Team sync call", done: false }],
  q4: [{ id: 5, text: "Check social feeds", done: false }],
};

const COLORS = {
  q1: {
    bg: "#161616",
    fg: "#FFFFFF",
    muted: "rgba(255,255,255,0.50)",
    check: "#FFFFFF",
    done: "rgba(255,255,255,0.36)",
  },
  q2: {
    bg: "#FFE68A",
    fg: INK,
    muted: "rgba(22,22,22,0.50)",
    check: INK,
    done: "rgba(22,22,22,0.34)",
  },
  q3: {
    bg: "#F2F2F0",
    fg: INK,
    muted: "rgba(22,22,22,0.46)",
    check: INK,
    done: "rgba(22,22,22,0.32)",
  },
  q4: {
    bg: "#F7DAD5",
    fg: INK,
    muted: "rgba(22,22,22,0.46)",
    check: INK,
    done: "rgba(22,22,22,0.32)",
  },
};

const TASK_DIVIDER_COLORS = {
  q1: "rgba(255,255,255,0.14)",
  q2: "rgba(22,22,22,0.12)",
  q3: "rgba(22,22,22,0.10)",
  q4: "rgba(22,22,22,0.10)",
};

function getNextId(tasks) {
  return (
    Math.max(
      0,
      ...Object.values(tasks)
        .flat()
        .map((task) => Number(task.id) || 0),
    ) + 1
  );
}

function isValidTasks(value) {
  return value && QUADS.every((q) => Array.isArray(value[q.id]));
}

function createEmptyTasks() {
  return QUADS.reduce((next, q) => {
    next[q.id] = [];
    return next;
  }, {});
}

function getLocalDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function upsertHistoryEntry(history, dayKey, tasks) {
  const entry = { dayKey, total: getTaskCount(tasks), tasks };
  const idx = history.findIndex((e) => e.dayKey === dayKey);
  if (idx === -1) {
    return [...history, entry].sort((a, b) => b.dayKey.localeCompare(a.dayKey));
  }
  const next = [...history];
  next[idx] = entry;
  return next;
}

function dayKeyToDate(dayKey) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatHistoryDate(dayKey) {
  const today = getLocalDayKey();
  const dy = new Date(); dy.setDate(dy.getDate() - 1);
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  if (dayKey === today) return "Today";
  if (dayKey === getLocalDayKey(dy)) return "Yesterday";
  if (dayKey === getLocalDayKey(tm)) return "Tomorrow";
  const date = dayKeyToDate(dayKey);
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${DOW[date.getDay()]} ${date.getDate()} ${MON[date.getMonth()]}`;
}

// Returns { label, dateStr } for the date pill.
// label = "Today" / "Yesterday" / "Tomorrow" / null
// dateStr = "Tue 27 May"
function formatPillParts(dayKey) {
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const today = getLocalDayKey();
  const dy = new Date(); dy.setDate(dy.getDate() - 1);
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  const date = dayKey ? dayKeyToDate(dayKey) : new Date();
  const dateStr = `${DOW[date.getDay()]} ${date.getDate()} ${MON[date.getMonth()]}`;
  if (!dayKey || dayKey === today) return { label: "Today", dateStr };
  if (dayKey === getLocalDayKey(dy)) return { label: "Yesterday", dateStr };
  if (dayKey === getLocalDayKey(tm)) return { label: "Tomorrow", dateStr };
  return { label: null, dateStr };
}

function formatHistoryDateLong(dayKey) {
  const today = getLocalDayKey();
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = getLocalDayKey(d);
  if (dayKey === today) return "Today";
  if (dayKey === yesterday) return "Yesterday";
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const yearSuffix = date.getFullYear() !== new Date().getFullYear() ? `, ${year}` : "";
  return `${DOW[date.getDay()]}, ${MON[month - 1]} ${day}${yearSuffix}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDatePill(date = new Date()) {
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${DOW[date.getDay()]} ${date.getDate()} ${MON[date.getMonth()]}`;
}

function getCalendarGrid(year, month) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(d);
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

function formatDeadlineShort(dayKey) {
  const today = getLocalDayKey();
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (dayKey === today) return "Today";
  if (dayKey === getLocalDayKey(d)) return "Tomorrow";
  return formatHistoryDate(dayKey);
}

function getTaskCount(tasks) {
  if (!isValidTasks(tasks)) return 0;
  return QUADS.reduce((total, q) => total + tasks[q.id].length, 0);
}

function getDoneCount(tasks) {
  if (!isValidTasks(tasks)) return 0;
  return QUADS.reduce(
    (total, q) => total + tasks[q.id].filter((task) => task.done).length,
    0,
  );
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

function getVirtualDropSlots(list, qid, currentDragging, layouts = {}) {
  let cursor = 0;
  const slots = [];

  list.forEach((task) => {
    if (currentDragging?.from === qid && currentDragging.task.id === task.id)
      return;
    const layout = layouts[task.id];
    const height = Math.max(
      1,
      Number.isFinite(layout?.height) ? layout.height : 42,
    );
    slots.push({ task, top: cursor, height });
    cursor += height;
  });

  return { slots, totalHeight: cursor };
}

function constrainDropIndexByDone(slots, index, draggedTask) {
  const clampedIndex = Math.max(0, Math.min(slots.length, index));
  if (!draggedTask) return clampedIndex;

  const firstDoneIndex = slots.findIndex((slot) => slot.task.done);
  const doneStart = firstDoneIndex === -1 ? slots.length : firstDoneIndex;

  return draggedTask.done
    ? Math.max(doneStart, clampedIndex)
    : Math.min(doneStart, clampedIndex);
}

function getMoveIndexFromMarker(list, qid, markerIndex, currentDragging) {
  let index = markerIndex;

  if (currentDragging?.from === qid) {
    const fromIndex = list.findIndex(
      (task) => task.id === currentDragging.task.id,
    );
    if (fromIndex !== -1 && fromIndex < markerIndex) index -= 1;
  }

  const targetLength =
    currentDragging?.from === qid ? Math.max(0, list.length - 1) : list.length;
  return Math.max(0, Math.min(targetLength, index));
}

function clamp01(value) {
  "worklet";
  return Math.max(0, Math.min(1, value));
}

function orderTasksByDone(list) {
  const active = [];
  const done = [];
  list.forEach((task) => {
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
  return TASK_DIVIDER_COLORS[quadId] || "rgba(128,128,128,0.16)";
}

function CheckButton({ done, quadId, taskId, onPress }) {
  const color = COLORS[quadId];
  const idleBorder =
    quadId === "q1" ? "rgba(255,255,255,0.42)" : "rgba(22,22,22,0.30)";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: done, disabled: false }}
      accessibilityLabel={done ? "Mark incomplete" : "Mark complete"}
      disabled={false}
      hitSlop={0}
      onPress={onPress}
      testID={`task-${taskId}-check`}
      style={({ pressed }) => [styles.checkHit, pressed && styles.pressed]}
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

const MiniTask = memo(
  function MiniTask({
    task,
    quadId,
    isDragging,
    isLast,
    onEdit,
    onToggle,
    onBeginDrag,
    onDragMove,
    onEndDrag,
    onLayout,
  }) {
    const longPressTimer = useRef(null);
    const didLongPress = useRef(false);
    const moved = useRef(false);
    const pressBlocked = useRef(false);
    const start = useRef({ x: 0, y: 0 });
    const isLongTask = task.text.length > LONG_TASK_TEXT_LENGTH;
    const isDoneVisual = task.done;
    const taskTextColor = isDoneVisual
      ? COLORS[quadId].done
      : COLORS[quadId].fg;
    const dividerColor = getTaskDividerColor(quadId);

    useEffect(() => () => clearTimeout(longPressTimer.current), []);

    const beginTouch = (event) => {
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

    const moveTouch = (event) => {
      const { pageX, pageY } = event.nativeEvent;
      if (
        !didLongPress.current &&
        (Math.abs(pageX - start.current.x) > 9 ||
          Math.abs(pageY - start.current.y) > 9)
      ) {
        moved.current = true;
        pressBlocked.current = true;
        clearTimeout(longPressTimer.current);
        return;
      }
      if (didLongPress.current) onDragMove(pageX, pageY);
    };

    const endTouch = (cancelled) => {
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
          !isLast && [
            styles.miniTaskDivider,
            { borderBottomColor: dividerColor },
          ],
          isLongTask && styles.miniTaskRoomy,
          isDragging && styles.dragSource,
        ]}
      >
        <CheckButton
          done={task.done}
          quadId={quadId}
          taskId={task.id}
          onPress={onToggle}
        />
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
          <View style={styles.miniTaskNameRow}>
            <Text
              style={[
                styles.miniText,
                { color: taskTextColor },
                isDoneVisual && styles.doneText,
              ]}
            >
              {task.text}
            </Text>
            {task.repeat && !isDoneVisual && (
              <Ionicons
                name="repeat"
                size={9}
                color={COLORS[quadId].muted}
              />
            )}
          </View>
          {task.deadline && !isDoneVisual && (
            <Text
              style={[
                styles.deadlineLabel,
                { color: task.deadline < getLocalDayKey() ? DANGER : COLORS[quadId].muted },
              ]}
            >
              {formatDeadlineShort(task.deadline)}
            </Text>
          )}
        </Pressable>
      </View>
    );
  },
  (prev, next) =>
    prev.task === next.task &&
    prev.quadId === next.quadId &&
    prev.isDragging === next.isDragging &&
    prev.isLast === next.isLast,
);

const keyTask = (task) => String(task.id);

const QuadrantTile = memo(
  function QuadrantTile({
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
    const isTopTile = q.id === "q1" || q.id === "q2";
    const isDropActive = dropMarkerTop !== null;
    const dropGuideColor = getDropGuideColor(q.id);
    const dropOverlayAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      dropOverlayAnim.stopAnimation();
      dropOverlayAnim.setValue(isDropActive ? 1 : 0);
    }, [dropOverlayAnim, isDropActive]);

    const renderTask = useCallback(
      ({ item, index }) => (
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
          onLayout={(event) => onTaskLayout(q.id, item.id, event)}
        />
      ),
      [
        draggingTaskId,
        onBeginDrag,
        onDragMove,
        onEndDrag,
        onOpenComposer,
        onTaskLayout,
        onToggleTask,
        q.id,
        tasks.length,
      ],
    );

    const renderFooter = useCallback(
      () => (
        <Pressable
          accessible
          accessibilityLabel={`Add task to ${q.title}`}
          accessibilityRole="button"
          testID={`quadrant-${q.id}-empty-add-zone`}
          onPress={() => onOpenComposer(q.id)}
          style={({ pressed }) => [styles.emptyAddZone, pressed && { opacity: 0.6 }]}
        />
      ),
      [onOpenComposer, q.id, q.title],
    );

    return (
      <View
        testID={`quadrant-${q.id}`}
        ref={setQuadRef}
        collapsable={false}
        onLayout={onMeasure}
        style={[styles.tile, { backgroundColor: color.bg }]}
      >
        <View
          style={[styles.tileHead, isTopTile && { paddingTop: 28 + topInset }]}
        >
          <View style={styles.tileHeadTop}>
            <Text
              style={[styles.tileTitle, { color: color.fg }]}
              numberOfLines={2}
            >
              {q.title}
            </Text>
          </View>
          <Text style={[styles.tileDesc, { color: color.muted }]}>
            {q.desc}
          </Text>
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
            onScroll={(event) =>
              onTaskScroll(q.id, event.nativeEvent.contentOffset.y)
            }
            onContentSizeChange={(_, height) => onTaskContentSize(q.id, height)}
            scrollEventThrottle={16}
            scrollEnabled={!draggingActive}
            showsVerticalScrollIndicator={false}
            initialNumToRender={INITIAL_RENDER_TASKS}
            maxToRenderPerBatch={TASK_RENDER_BATCH}
            updateCellsBatchingPeriod={32}
            windowSize={LIST_WINDOW_SIZE}
            removeClippedSubviews={Platform.OS === "android"}
            keyboardShouldPersistTaps="handled"
            extraData={draggingTaskId || ""}
          />
          {dropMarkerTop !== null && (
            <View
              pointerEvents="none"
              style={[
                styles.dropInsertMarkerFloating,
                { top: Math.max(0, dropMarkerTop - 5) },
              ]}
            >
              <View
                style={[
                  styles.dropInsertLine,
                  { backgroundColor: dropGuideColor },
                ]}
              />
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
          <View
            style={[
              styles.dropOverlayLine,
              styles.dropOverlayLineTop,
              { backgroundColor: dropGuideColor, borderColor: dropGuideColor },
            ]}
          />
          <View
            style={[
              styles.dropOverlayLine,
              styles.dropOverlayLineRight,
              { backgroundColor: dropGuideColor, borderColor: dropGuideColor },
            ]}
          />
          <View
            style={[
              styles.dropOverlayLine,
              styles.dropOverlayLineBottom,
              { backgroundColor: dropGuideColor, borderColor: dropGuideColor },
            ]}
          />
          <View
            style={[
              styles.dropOverlayLine,
              styles.dropOverlayLineLeft,
              { backgroundColor: dropGuideColor, borderColor: dropGuideColor },
            ]}
          />
        </Animated.View>
      </View>
    );
  },
  (prev, next) =>
    prev.tasks === next.tasks &&
    prev.topInset === next.topInset &&
    prev.dropMarkerTop === next.dropMarkerTop &&
    prev.draggingTaskId === next.draggingTaskId &&
    prev.draggingActive === next.draggingActive &&
    prev.q.id === next.q.id,
);

const ArchiveCalendar = memo(function ArchiveCalendar({
  historyDayKeys,
  onSelect,
  onBack,
}) {
  const today = getLocalDayKey();
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const monthFadeAnim = useRef(new Animated.Value(1)).current;
  const daySet = new Set(historyDayKeys);
  const grid = getCalendarGrid(ym.year, ym.month);

  const changeMonth = useCallback((updater) => {
    Animated.timing(monthFadeAnim, {
      toValue: 0,
      duration: 70,
      easing: MOTION.in,
      useNativeDriver: true,
    }).start(() => {
      setYm(updater);
      Animated.spring(monthFadeAnim, { toValue: 1, ...MOTION.spring }).start();
    });
  }, [monthFadeAnim]);

  const prevMonth = useCallback(() =>
    changeMonth(({ year, month }) => {
      const d = new Date(year, month - 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    }), [changeMonth]);

  const nextMonth = useCallback(() =>
    changeMonth(({ year, month }) => {
      const d = new Date(year, month + 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    }), [changeMonth]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.archivePanelHeaderRow}>
        <Pressable onPress={onBack} style={({ pressed }) => [styles.archiveBackBtn, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.65)" />
        </Pressable>
        <Animated.Text style={[styles.archiveCalMonthLabel, { opacity: monthFadeAnim }]}>
          {MONTH_NAMES[ym.month]} {ym.year}
        </Animated.Text>
        <View style={styles.archiveCalNavGroup}>
          <Pressable onPress={prevMonth} style={({ pressed }) => [styles.archiveCalNav, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.55)" />
          </Pressable>
          <Pressable onPress={nextMonth} style={({ pressed }) => [styles.archiveCalNav, pressed && styles.pressed]}>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.55)" />
          </Pressable>
        </View>
      </View>

      <Animated.View style={[styles.archiveCalBody, { opacity: monthFadeAnim }]}>
        <View style={styles.archiveCalDowRow}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <Text key={d} style={styles.archiveCalDow}>{d}</Text>
          ))}
        </View>
        <View style={styles.archiveCalGrid}>
          {grid.map((day, idx) => {
            if (!day) return <View key={`e-${idx}`} style={styles.archiveCalCell} />;
            const mm = String(ym.month + 1).padStart(2, "0");
            const dd = String(day).padStart(2, "0");
            const dayKey = `${ym.year}-${mm}-${dd}`;
            const isToday = dayKey === today;
            const hasEntry = daySet.has(dayKey);
            return (
              <Pressable
                key={dayKey}
                style={({ pressed }) => [styles.archiveCalCell, pressed && styles.pressed]}
                onPress={() => onSelect(dayKey)}
              >
                <View style={[
                  styles.archiveCalDayInner,
                  hasEntry && styles.archiveCalDayHasEntry,
                  isToday && styles.archiveCalDayToday,
                ]}>
                  <Text style={[
                    styles.archiveCalDayText,
                    hasEntry && styles.archiveCalDayTextHasEntry,
                    isToday && styles.archiveCalDayTextToday,
                  ]}>
                    {day}
                  </Text>
                </View>
                {hasEntry && <View style={styles.archiveCalDot} />}
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
});

const DeadlinePicker = memo(function DeadlinePicker({ value, quadId, onChange, onClose, minDate, maxDate }) {
  const color = COLORS[quadId];
  const today = getLocalDayKey();
  const effectiveMin = minDate === undefined ? today : minDate;
  const [ym, setYm] = useState(() => {
    const base = value ? new Date(value + "T00:00:00") : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const monthFadeAnim = useRef(new Animated.Value(1)).current;
  const grid = getCalendarGrid(ym.year, ym.month);

  const changeMonth = useCallback((updater) => {
    Animated.timing(monthFadeAnim, {
      toValue: 0,
      duration: 70,
      easing: MOTION.in,
      useNativeDriver: true,
    }).start(() => {
      setYm(updater);
      Animated.spring(monthFadeAnim, { toValue: 1, ...MOTION.spring }).start();
    });
  }, [monthFadeAnim]);

  const prevMonth = useCallback(() =>
    changeMonth(({ year, month }) => {
      const d = new Date(year, month - 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    }), [changeMonth]);

  const nextMonth = useCallback(() =>
    changeMonth(({ year, month }) => {
      const d = new Date(year, month + 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    }), [changeMonth]);

  return (
    <View style={styles.deadlinePicker}>
      <View style={styles.deadlinePickerNav}>
        <Pressable onPress={prevMonth} style={({ pressed }) => [styles.deadlinePickerNavBtn, pressed && styles.pressed]}>
          <Text style={[styles.deadlinePickerNavText, { color: color.muted }]}>{"‹"}</Text>
        </Pressable>
        <Animated.Text style={[styles.deadlinePickerMonthLabel, { color: color.fg, opacity: monthFadeAnim }]}>
          {MONTH_NAMES[ym.month]} {ym.year}
        </Animated.Text>
        <Pressable onPress={nextMonth} style={({ pressed }) => [styles.deadlinePickerNavBtn, pressed && styles.pressed]}>
          <Text style={[styles.deadlinePickerNavText, { color: color.muted }]}>{"›"}</Text>
        </Pressable>
      </View>
      <Animated.View style={[styles.deadlinePickerDowRow, { opacity: monthFadeAnim }]}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((dow) => (
          <Text key={dow} style={[styles.deadlinePickerDow, { color: color.muted }]}>{dow}</Text>
        ))}
      </Animated.View>
      <Animated.View style={[styles.deadlinePickerGrid, { opacity: monthFadeAnim }]}>
        {grid.map((day, idx) => {
          if (!day) return <View key={`e-${idx}`} style={styles.deadlinePickerCell} />;
          const mm = String(ym.month + 1).padStart(2, "0");
          const dd = String(day).padStart(2, "0");
          const dayKey = `${ym.year}-${mm}-${dd}`;
          const isSelected = dayKey === value;
          const isToday = dayKey === today;
          const isPast = effectiveMin != null && dayKey < effectiveMin;
          const isFuture = maxDate ? dayKey > maxDate : false;
          const isDisabled = isPast || isFuture;
          return (
            <Pressable
              key={dayKey}
              style={({ pressed }) => [styles.deadlinePickerCell, pressed && !isDisabled && styles.pressed]}
              onPress={() => { onChange(isSelected ? null : dayKey); onClose(); }}
              disabled={isDisabled}
            >
              <View
                style={[
                  styles.deadlinePickerDayInner,
                  isSelected && { backgroundColor: color.fg },
                  isToday && !isSelected && styles.deadlinePickerTodayRing,
                ]}
              >
                <Text
                  style={[
                    styles.deadlinePickerDayText,
                    { color: isDisabled ? color.muted : isSelected ? color.bg : color.fg },
                  ]}
                >
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </Animated.View>
      {value && (
        <Pressable onPress={() => { onChange(null); onClose(); }} style={({ pressed }) => [styles.deadlineClearBtn, pressed && styles.pressed]}>
          <Text style={[styles.deadlineClearBtnText, { color: color.muted }]}>Clear deadline</Text>
        </Pressable>
      )}
    </View>
  );
});

const ARCHIVE_DELETE_WIDTH = 72;

const ArchiveListItem = memo(function ArchiveListItem({ item, index, onPress, onDelete, onSwipeOpen }) {
  const swipeX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);
  const onSwipeOpenRef = useRef(onSwipeOpen);
  onSwipeOpenRef.current = onSwipeOpen;

  const closeAnim = useRef(() => {
    isOpen.current = false;
    Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, tension: 180, friction: 26, overshootClamping: true }).start();
  }).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 3 && Math.abs(gs.dy) < Math.abs(gs.dx) * 1.2,
      onPanResponderGrant: () => {
        swipeX.stopAnimation();
        swipeX.setOffset(isOpen.current ? -ARCHIVE_DELETE_WIDTH : 0);
        swipeX.setValue(0);
      },
      onPanResponderMove: (_, gs) => {
        swipeX.setValue(Math.max(-ARCHIVE_DELETE_WIDTH, Math.min(0, gs.dx)));
      },
      onPanResponderRelease: (_, gs) => {
        swipeX.flattenOffset();
        const baseVal = isOpen.current ? -ARCHIVE_DELETE_WIDTH : 0;
        const projected = baseVal + gs.dx;
        const shouldOpen = projected < -ARCHIVE_DELETE_WIDTH / 2;
        if (shouldOpen && !isOpen.current) {
          onSwipeOpenRef.current?.(closeAnim);
        }
        isOpen.current = shouldOpen;
        Animated.spring(swipeX, {
          toValue: shouldOpen ? -ARCHIVE_DELETE_WIDTH : 0,
          useNativeDriver: true,
          tension: 180,
          friction: 26,
          overshootClamping: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        swipeX.flattenOffset();
        isOpen.current = false;
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, tension: 180, friction: 26, overshootClamping: true }).start();
      },
    }),
  ).current;

  // counter-translate so text stays visually fixed while the row slides
  const textX = swipeX.interpolate({
    inputRange: [-ARCHIVE_DELETE_WIDTH, 0],
    outputRange: [ARCHIVE_DELETE_WIDTH, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.archiveItemWrap}>
      <View style={styles.archiveItemDeleteBack}>
        <Pressable onPress={onDelete} style={({ pressed }) => [styles.archiveItemDeleteBtn, pressed && { opacity: 0.72 }]}>
          <Ionicons name="trash-outline" size={20} color="#fff" />
        </Pressable>
      </View>
      <Animated.View
        style={[styles.archiveItemFront, { transform: [{ translateX: swipeX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={({ pressed }) => [
            styles.archiveEntry,
            index === 0 && styles.archiveEntryFirst,
            pressed && styles.archiveEntryPressed,
          ]}
          onPress={onPress}
        >
          <Animated.View
            style={[styles.archiveEntryLeft, { transform: [{ translateX: textX }] }]}
          >
            <Text style={styles.archiveEntryDate}>{formatHistoryDateLong(item.dayKey)}</Text>
            <Text style={styles.archiveEntryCount}>
              {item.total === 1 ? "1 task" : `${item.total} tasks`}
            </Text>
          </Animated.View>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.28)" />
        </Pressable>
      </Animated.View>
    </View>
  );
});

function EisenhowerApp() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [fontsLoaded] = useFonts({
    Nunito_600SemiBold: require("@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf"),
    Nunito_700Bold: require("@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf"),
    Nunito_800ExtraBold: require("@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf"),
    Nunito_900Black: require("@expo-google-fonts/nunito/900Black/Nunito_900Black.ttf"),
  });
  const [tasks, setTasks] = useState(INIT);
  const [nextId, setNextId] = useState(getNextId(INIT));
  const [composer, setComposer] = useState(null);
  const [addVal, setAddVal] = useState("");
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [lastDeleted, setLastDeleted] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveScreen, setArchiveScreen] = useState("list");
  const [repeat, setRepeat] = useState(false);
  const [viewingDayKey, setViewingDayKey] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [deadlinePickerOpen, setDeadlinePickerOpen] = useState(false);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [sortByDeadline, setSortByDeadline] = useState(false);
  const [editConflict, setEditConflict] = useState(null);
  const [deleteConflict, setDeleteConflict] = useState(null);
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
  const historyRef = useRef([]);
  const openArchiveRef = useRef(null);
  const closeArchiveRef = useRef(null);
  const viewingDayKeyRef = useRef(null);
  const openArchiveItemRef = useRef(null);
  const composerAnim = useRef(new Animated.Value(0)).current;
  const archiveAnim = useRef(new Animated.Value(0)).current;
  const dragAnim = useRef(new Animated.Value(0)).current;
  const dragXAnim = useRef(new Animated.Value(0)).current;
  const dragYAnim = useRef(new Animated.Value(0)).current;
  const deleteHotAnim = useRef(new Animated.Value(0)).current;
  const trashAnim = useRef(new Animated.Value(0)).current;
  const undoAnim = useRef(new Animated.Value(0)).current;
  const archiveCalAnim = useRef(new Animated.Value(0)).current;
  const conflictAnim = useRef(new Animated.Value(0)).current;
  const deleteConflictAnim = useRef(new Animated.Value(0)).current;
  const splashScaleAnim = useRef(new Animated.Value(1)).current;
  const splashOpacityAnim = useRef(new Animated.Value(1)).current;
  const matrixOpacityAnim = useRef(new Animated.Value(0)).current;

  tasksRef.current = tasks;
  historyRef.current = history;
  viewingDayKeyRef.current = viewingDayKey;

  useEffect(() => {
    let mounted = true;

    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(ACTIVE_DAY_KEY),
      AsyncStorage.getItem(HISTORY_KEY),
    ])
      .then(([taskValue, activeDayValue, historyValue]) => {
        if (!mounted) return;
        const storedTasks = taskValue ? JSON.parse(taskValue) : null;
        const storedHistory = historyValue ? JSON.parse(historyValue) : [];
        const safeHistory = Array.isArray(storedHistory) ? storedHistory : [];
        const today = getLocalDayKey();

        let nextTasks;
        let nextHistory = safeHistory;

        if (
          activeDayValue &&
          activeDayValue !== today &&
          isValidTasks(storedTasks)
        ) {
          nextHistory = upsertHistoryEntry(safeHistory, activeDayValue, storedTasks);
          nextTasks = createEmptyTasks();
          QUADS.forEach((q) => {
            nextTasks[q.id] = (storedTasks[q.id] || [])
              .filter((t) => t.repeat || (t.deadline && !t.done))
              .map((t) => ({ ...t, done: false }));
          });
          AsyncStorage.multiSet([
            [HISTORY_KEY, JSON.stringify(nextHistory)],
            [ACTIVE_DAY_KEY, today],
            [STORAGE_KEY, JSON.stringify(nextTasks)],
          ]).catch(() => {});
        } else {
          nextTasks = isValidTasks(storedTasks) ? normalizeTasks(storedTasks) : INIT;
          if (!activeDayValue) {
            AsyncStorage.setItem(ACTIVE_DAY_KEY, today).catch(() => {});
          }
        }

        // Inject repeat and undone-deadline tasks from past history into today's tasks.
        // Covers tasks created via archive on past days that weren't propagated yet.
        {
          const seen = new Set();
          QUADS.forEach((q) => nextTasks[q.id].forEach((t) => seen.add(t.id)));
          const pastEntries = nextHistory
            .filter((e) => e.dayKey < today)
            .sort((a, b) => b.dayKey.localeCompare(a.dayKey));
          for (const past of pastEntries) {
            QUADS.forEach((q) => {
              (past.tasks[q.id] || []).forEach((t) => {
                if (seen.has(t.id)) return;
                seen.add(t.id);
                const shouldPropagate =
                  (t.repeat && (!t.deadline || t.deadline >= today)) ||
                  (!t.repeat && t.deadline && t.deadline >= today && !t.done);
                if (shouldPropagate) {
                  nextTasks[q.id].push({ ...t, done: false });
                }
              });
            });
          }
        }

        setTasks(nextTasks);
        setNextId(getNextId(nextTasks));
        historyRef.current = nextHistory;
        setHistory(nextHistory);
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
      const vdk = viewingDayKeyRef.current;
      if (vdk) {
        const nextHistory = upsertHistoryEntry(historyRef.current, vdk, tasks);
        historyRef.current = nextHistory;
        persistInteraction.current = InteractionManager.runAfterInteractions(() => {
          setHistory(nextHistory);
          AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)).catch(() => {});
        });
      } else {
        const today = getLocalDayKey();
        const nextHistory = upsertHistoryEntry(historyRef.current, today, tasks);
        historyRef.current = nextHistory;
        const taskPayload = JSON.stringify(tasks);
        persistInteraction.current = InteractionManager.runAfterInteractions(() => {
          setHistory(nextHistory);
          AsyncStorage.setItem(STORAGE_KEY, taskPayload).catch(() => {});
          AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)).catch(() => {});
        });
      }
    }, PERSIST_DELAY);
  }, [loaded, tasks]);

  useEffect(() => {
    trashAnim.stopAnimation();
    trashAnim.setValue(dragging ? 1 : 0);
  }, [dragging, trashAnim]);

  useEffect(() => {
    deleteHotAnim.stopAnimation();
    deleteHotAnim.setValue(dropTarget === "trash" ? 1 : 0);
  }, [deleteHotAnim, dropTarget]);

  useEffect(() => {
    if (!lastDeleted || dragging) {
      undoAnim.setValue(0);
      return;
    }
    Animated.spring(undoAnim, { toValue: 1, ...MOTION.spring }).start();
  }, [dragging, lastDeleted, undoAnim]);

  useEffect(() => {
    if (!editConflict) return;
    conflictAnim.setValue(0);
    Animated.spring(conflictAnim, { toValue: 1, ...MOTION.springFast }).start();
  }, [editConflict, conflictAnim]);

  useEffect(() => {
    if (!deleteConflict) return;
    deleteConflictAnim.setValue(0);
    Animated.spring(deleteConflictAnim, { toValue: 1, ...MOTION.springFast }).start();
  }, [deleteConflict, deleteConflictAnim]);

  useEffect(() => {
    if (!loaded || !fontsLoaded) return;
    const splashSize = Math.min(windowWidth || 390, windowHeight || 844) * SPLASH_GRID_RATIO;
    const targetScale = Math.max(windowWidth || 390, windowHeight || 844) / splashSize * 1.6;
    // Small delay lets the native layer apply the loaded fonts before the matrix fades in.
    const fontSettle = setTimeout(() => {
    Animated.parallel([
      Animated.spring(splashScaleAnim, {
        toValue: targetScale,
        tension: 38,
        friction: 9,
        overshootClamping: true,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(280),
        Animated.timing(splashOpacityAnim, {
          toValue: 0,
          duration: 220,
          easing: MOTION.in,
          useNativeDriver: true,
        }),
      ]),
      // matrix fades in slightly behind splash fade-out — cross-fade, no white frame
      Animated.sequence([
        Animated.delay(300),
        Animated.timing(matrixOpacityAnim, {
          toValue: 1,
          duration: 200,
          easing: MOTION.out,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
    }, 60);
    return () => clearTimeout(fontSettle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, fontsLoaded]);

  useEffect(
    () => () => {
      clearTimeout(undoTimer.current);
      clearTimeout(persistTimer.current);
      persistInteraction.current?.cancel?.();
      if (autoScrollFrame.current)
        cancelAnimationFrame(autoScrollFrame.current);
      if (dragMoveFrame.current) cancelAnimationFrame(dragMoveFrame.current);
    },
    [],
  );

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
    QUADS.forEach((q) => {
      quadRefs.current[q.id]?.measureInWindow((x, y, width, height) => {
        quadRects.current[q.id] = { x, y, width, height };
      });
      taskAreaRefs.current[q.id]?.measureInWindow((x, y, width, height) => {
        taskAreaRects.current[q.id] = { x, y, width, height };
      });
    });
  };

  const handleShellLayout = (event) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0 && height > shellHeightRef.current) {
      shellHeightRef.current = height;
      setShellHeight(height);
    }
    measureTargets();
  };

  const targetAt = (x, y) => {
    const trash = trashRect.current;
    if (
      trash &&
      x >= trash.x &&
      x <= trash.x + trash.width &&
      y >= trash.y &&
      y <= trash.y + trash.height
    ) {
      return { type: "trash" };
    }
    const quad = QUADS.find((q) => {
      const rect = quadRects.current[q.id];
      return (
        rect &&
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height
      );
    });
    if (!quad) return null;
    const taskArea =
      taskAreaRects.current[quad.id] || quadRects.current[quad.id];
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

    markerIndex = constrainDropIndexByDone(
      slots,
      markerIndex,
      draggingRef.current?.task,
    );
    const index = getMoveIndexFromMarker(
      list,
      quad.id,
      markerIndex,
      draggingRef.current,
    );

    return { type: "quad", qid: quad.id, index, markerIndex };
  };

  const resolveDragTarget = (x, y, force = false) => {
    const now = Date.now();
    if (!force && now - lastHitTestAt.current < DROP_HIT_TEST_INTERVAL) {
      return dropTargetRef.current;
    }

    lastHitTestAt.current = now;
    return targetAt(x, y);
  };

  const setActiveDropTarget = (target) => {
    const nextDropTarget =
      target?.type === "trash" ? "trash" : target?.qid || null;
    const nextDropIndex = target?.type === "quad" ? target.markerIndex : null;

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
    if (target?.type !== "quad") return false;
    const area = taskAreaRects.current[target.qid];
    const contentHeight = taskContentHeights.current[target.qid] || 0;
    const viewHeight = area?.height || 0;
    const maxOffset = Math.max(0, contentHeight - viewHeight);
    if (!area || maxOffset <= 0) return false;
    return (
      y < area.y + AUTO_SCROLL_EDGE ||
      y > area.y + area.height - AUTO_SCROLL_EDGE
    );
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

    if (target?.type === "quad") {
      const qid = target.qid;
      const area = taskAreaRects.current[qid];
      const contentHeight = taskContentHeights.current[qid] || 0;
      const viewHeight = area?.height || 0;
      const maxOffset = Math.max(0, contentHeight - viewHeight);

      if (area && maxOffset > 0) {
        const currentOffset = taskScrollOffsets.current[qid] || 0;
        let delta = 0;

        if (current.y < area.y + AUTO_SCROLL_EDGE) {
          const intensity = Math.min(
            1,
            Math.max(
              0,
              (area.y + AUTO_SCROLL_EDGE - current.y) / AUTO_SCROLL_EDGE,
            ),
          );
          delta = -Math.ceil(2 + intensity * 7);
        } else if (current.y > area.y + area.height - AUTO_SCROLL_EDGE) {
          const intensity = Math.min(
            1,
            Math.max(
              0,
              (current.y - (area.y + area.height - AUTO_SCROLL_EDGE)) /
                AUTO_SCROLL_EDGE,
            ),
          );
          delta = Math.ceil(2 + intensity * 7);
        }

        if (delta !== 0) {
          const nextOffset = Math.max(
            0,
            Math.min(maxOffset, currentOffset + delta),
          );
          if (nextOffset !== currentOffset) {
            taskScrollOffsets.current[qid] = nextOffset;
            taskListRefs.current[qid]?.scrollToOffset({
              offset: nextOffset,
              animated: false,
            });
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

  const syncAutoScroll = (target) => {
    const current = draggingRef.current;
    if (!current || !canAutoScroll(target, current.y)) {
      stopAutoScroll();
      return;
    }
    if (autoScrollFrame.current) return;
    stopAutoScroll();
    autoScrollFrame.current = requestAnimationFrame(runAutoScroll);
  };

  const openComposer = (qid, task = null) => {
    composerAnim.stopAnimation();
    setComposer({ qid, taskId: task?.id || null });
    setAddVal(task?.text || "");
    setRepeat(task?.repeat || false);
    setDeadline(task?.deadline || null);
    setDeadlinePickerOpen(false);
    setMovePickerOpen(false);
    composerAnim.setValue(0);
    Animated.spring(composerAnim, { toValue: 1, ...MOTION.spring }).start();
  };

  const closeComposer = (animated = true) => {
    if (!composer) return;
    const finish = () => {
      setComposer(null);
      setAddVal("");
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
    }).start(({ finished }) => { if (finished) finish(); });
  };

  const toggleTask = (qid, tid) => {
    const task = tasksRef.current[qid]?.find((t) => t.id === tid);
    const newDone = task ? !task.done : false;
    if (task && !task.repeat && task.deadline) {
      const currentDayKey = viewingDayKeyRef.current || getLocalDayKey();
      const appearsElsewhere = historyRef.current.some(
        (entry) =>
          entry.dayKey !== currentDayKey &&
          QUADS.some((q) => (entry.tasks[q.id] || []).some((t) => t.id === tid)),
      );
      if (appearsElsewhere) {
        const nextHistory = historyRef.current.map((entry) => {
          const inEntry = QUADS.some((q) => (entry.tasks[q.id] || []).some((t) => t.id === tid));
          if (!inEntry) return entry;
          const updatedTasks = QUADS.reduce((acc, q) => {
            acc[q.id] = (entry.tasks[q.id] || []).map((t) =>
              t.id === tid ? { ...t, done: newDone } : t,
            );
            return acc;
          }, { ...entry.tasks });
          return { ...entry, tasks: updatedTasks };
        });
        historyRef.current = nextHistory;
        setHistory(nextHistory);
        AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)).catch(() => {});
      }
    }
    setTasks((prev) => ({
      ...prev,
      [qid]: orderTasksByDone(
        prev[qid].map((t) => t.id === tid ? { ...t, done: newDone } : t),
      ),
    }));
  };

  const deleteTask = (qid, tid) => {
    const currentDayKey = viewingDayKeyRef.current || getLocalDayKey();
    const appearsElsewhere = historyRef.current.some(
      (entry) =>
        entry.dayKey !== currentDayKey &&
        QUADS.some((q) => (entry.tasks[q.id] || []).some((t) => t.id === tid)),
    );
    if (appearsElsewhere) {
      setDeleteConflict({ qid, tid });
      return;
    }
    setTasks((prev) => {
      const index = prev[qid].findIndex((task) => task.id === tid);
      if (index === -1) return prev;
      const task = prev[qid][index];
      setLastDeleted({ qid, task, index });
      clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setLastDeleted(null), 4500);
      return { ...prev, [qid]: prev[qid].filter((item) => item.id !== tid) };
    });
  };

  const confirmDeleteThisOnly = useCallback(() => {
    if (!deleteConflict) return;
    const { qid, tid } = deleteConflict;
    setTasks((prev) => {
      const index = prev[qid].findIndex((t) => t.id === tid);
      if (index === -1) return prev;
      const task = prev[qid][index];
      setLastDeleted({ qid, task, index });
      clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setLastDeleted(null), 4500);
      return { ...prev, [qid]: prev[qid].filter((t) => t.id !== tid) };
    });
    setDeleteConflict(null);
  }, [deleteConflict]);

  const confirmDeleteFromHere = useCallback(() => {
    if (!deleteConflict) return;
    const { qid, tid } = deleteConflict;
    const currentDayKey = viewingDayKeyRef.current || getLocalDayKey();
    const d = new Date(currentDayKey + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    const dayBefore = getLocalDayKey(d);
    const nextHistory = historyRef.current.map((entry) => {
      const inEntry = QUADS.some((q) => (entry.tasks[q.id] || []).some((t) => t.id === tid));
      if (!inEntry) return entry;
      if (entry.dayKey < currentDayKey) {
        // Past entries: stop future propagation without deleting history.
        // - repeat + deadline → shrink deadline to day before currentDayKey
        // - repeat only → strip repeat flag
        // - deadline only → leave as-is (already won't propagate past deadline)
        const updatedTasks = QUADS.reduce((acc, q) => {
          acc[q.id] = (entry.tasks[q.id] || []).map((t) => {
            if (t.id !== tid) return t;
            if (t.repeat && t.deadline) return { ...t, deadline: dayBefore };
            if (t.repeat) return { ...t, repeat: false };
            return t;
          });
          return acc;
        }, { ...entry.tasks });
        return { ...entry, tasks: updatedTasks };
      }
      // Current day and future: remove task entirely
      const updatedTasks = QUADS.reduce((acc, q) => {
        acc[q.id] = (entry.tasks[q.id] || []).filter((t) => t.id !== tid);
        return acc;
      }, { ...entry.tasks });
      const total = QUADS.reduce((s, q) => s + updatedTasks[q.id].length, 0);
      return { ...entry, tasks: updatedTasks, total };
    });
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)).catch(() => {});
    setTasks((prev) => ({ ...prev, [qid]: prev[qid].filter((t) => t.id !== tid) }));
    setDeleteConflict(null);
  }, [deleteConflict]);

  const confirmDeleteAll = useCallback(() => {
    if (!deleteConflict) return;
    const { qid, tid } = deleteConflict;
    const nextHistory = historyRef.current.map((entry) => {
      const inEntry = QUADS.some((q) => (entry.tasks[q.id] || []).some((t) => t.id === tid));
      if (!inEntry) return entry;
      const updatedTasks = QUADS.reduce((acc, q) => {
        acc[q.id] = (entry.tasks[q.id] || []).filter((t) => t.id !== tid);
        return acc;
      }, { ...entry.tasks });
      const total = QUADS.reduce((s, q) => s + updatedTasks[q.id].length, 0);
      return { ...entry, tasks: updatedTasks, total };
    });
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)).catch(() => {});
    setTasks((prev) => ({ ...prev, [qid]: prev[qid].filter((t) => t.id !== tid) }));
    setDeleteConflict(null);
  }, [deleteConflict]);

  const undoDelete = () => {
    if (!lastDeleted) return;
    setTasks((prev) => {
      const list = [...prev[lastDeleted.qid]];
      list.splice(lastDeleted.index, 0, lastDeleted.task);
      return { ...prev, [lastDeleted.qid]: orderTasksByDone(list) };
    });
    clearTimeout(undoTimer.current);
    setLastDeleted(null);
  };

  const closeArchive = useCallback(
    (onDone) => {
      archiveAnim.stopAnimation();
      Animated.timing(archiveAnim, {
        toValue: 0,
        duration: 240,
        easing: MOTION.in,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setArchiveOpen(false);
          onDone?.();
        }
      });
    },
    [archiveAnim],
  );

  const openArchive = useCallback(() => {
    setArchiveOpen(true);
    setArchiveScreen("list");
    archiveAnim.stopAnimation();
    archiveAnim.setValue(0);
    Animated.spring(archiveAnim, { toValue: 1, ...MOTION.springPanel }).start();
  }, [archiveAnim]);

  openArchiveRef.current = openArchive;
  closeArchiveRef.current = closeArchive;

  const loadDayToMainScreen = useCallback((dayKey) => {
    const today = getLocalDayKey();
    // Flush the current day's tasks into historyRef before scanning for propagation.
    // Without this, repeat/deadline tasks created after the last persist-timer fire
    // won't be found when scanning past entries for the target day.
    const currentDayKey = viewingDayKeyRef.current || today;
    if (currentDayKey !== dayKey) {
      historyRef.current = upsertHistoryEntry(historyRef.current, currentDayKey, tasksRef.current);
    }
    closeArchive(() => {
      const entry = historyRef.current.find((e) => e.dayKey === dayKey);
      // Use stored entry only if it has tasks (non-empty). Empty entries are created
      // automatically by the persist effect and should not block repeat propagation.
      const useEntry = entry && entry.total > 0;
      let nextTasks;
      if (useEntry) {
        nextTasks = normalizeTasks(entry.tasks);
        // Remove repeat tasks whose deadline has passed for this day (bug #3).
        QUADS.forEach((q) => {
          nextTasks[q.id] = nextTasks[q.id].filter(
            (t) => !(t.repeat && t.deadline && t.deadline < dayKey),
          );
        });
      } else {
        nextTasks = createEmptyTasks();
      }
      // Inject tasks from earlier history that aren't already present.
      // - Repeat tasks: always propagate (each day is a fresh start).
      // - Deadline-only tasks: propagate if undone in the most-recent past entry.
      // Scan most-recent first so the latest done-state wins.
      const seen = new Set();
      QUADS.forEach((q) => nextTasks[q.id].forEach((t) => seen.add(t.id)));
      const pastEntries = historyRef.current
        .filter((e) => e.dayKey < dayKey)
        .sort((a, b) => b.dayKey.localeCompare(a.dayKey));
      for (const past of pastEntries) {
        QUADS.forEach((q) => {
          (past.tasks[q.id] || []).forEach((t) => {
            if (seen.has(t.id)) return;
            seen.add(t.id);
            const shouldPropagate =
              (t.repeat && (!t.deadline || t.deadline >= dayKey)) ||
              (!t.repeat && t.deadline && t.deadline >= dayKey && !t.done);
            if (shouldPropagate) {
              nextTasks[q.id].push({ ...t, done: false });
            }
          });
        });
      }
      setTasks(nextTasks);
      setNextId(getNextId(nextTasks));
      setViewingDayKey(dayKey === today ? null : dayKey);
    });
  }, [closeArchive]);

  const goToToday = useCallback(() => {
    const vdk = viewingDayKeyRef.current;
    if (vdk) {
      const nextHistory = upsertHistoryEntry(historyRef.current, vdk, tasksRef.current);
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)).catch(() => {});
    }
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      const storedTasks = value ? JSON.parse(value) : null;
      const todayTasks = isValidTasks(storedTasks) ? normalizeTasks(storedTasks) : createEmptyTasks();
      const today = getLocalDayKey();
      // Inject tasks from past history: repeat tasks (fresh each day) and
      // deadline-only tasks that are undone in their most-recent past entry.
      const seen = new Set();
      QUADS.forEach((q) => todayTasks[q.id].forEach((t) => seen.add(t.id)));
      const pastEntries = historyRef.current
        .filter((e) => e.dayKey < today)
        .sort((a, b) => b.dayKey.localeCompare(a.dayKey));
      for (const past of pastEntries) {
        QUADS.forEach((q) => {
          (past.tasks[q.id] || []).forEach((t) => {
            if (seen.has(t.id)) return;
            seen.add(t.id);
            const shouldPropagate =
              (t.repeat && (!t.deadline || t.deadline >= today)) ||
              (!t.repeat && t.deadline && t.deadline >= today && !t.done);
            if (shouldPropagate) {
              todayTasks[q.id].push({ ...t, done: false });
            }
          });
        });
      }
      setTasks(todayTasks);
      setNextId(getNextId(todayTasks));
      setViewingDayKey(null);
    }).catch(() => { setViewingDayKey(null); });
  }, []);

  const deleteHistoryEntry = useCallback((dayKey) => {
    const today = getLocalDayKey();
    if (dayKey === today) {
      // Today: clear tasks rather than delete the entry, so the day isn't lost.
      const emptyTasks = createEmptyTasks();
      const nextHistory = upsertHistoryEntry(historyRef.current, today, emptyTasks);
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      AsyncStorage.multiSet([
        [STORAGE_KEY, JSON.stringify(emptyTasks)],
        [HISTORY_KEY, JSON.stringify(nextHistory)],
      ]).catch(() => {});
      if (!viewingDayKeyRef.current) {
        setTasks(emptyTasks);
        setNextId(1);
      }
      return;
    }
    const nextHistory = historyRef.current.filter((e) => e.dayKey !== dayKey);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)).catch(() => {});
    if (viewingDayKeyRef.current === dayKey) {
      AsyncStorage.getItem(STORAGE_KEY).then((value) => {
        const storedTasks = value ? JSON.parse(value) : null;
        const nextTasks = isValidTasks(storedTasks) ? normalizeTasks(storedTasks) : createEmptyTasks();
        setTasks(nextTasks);
        setNextId(getNextId(nextTasks));
        setViewingDayKey(null);
      }).catch(() => { setViewingDayKey(null); });
    }
  }, []);

  const handleCalendarSelect = useCallback((dayKey) => {
    loadDayToMainScreen(dayKey);
  }, [loadDayToMainScreen]);

  const handleArchiveAddDate = useCallback(() => {
    setArchiveScreen("calendar");
    archiveCalAnim.setValue(0);
    Animated.spring(archiveCalAnim, { toValue: 1, ...MOTION.spring }).start();
  }, [archiveCalAnim]);

  const handleCalendarBack = useCallback(() => {
    Animated.timing(archiveCalAnim, {
      toValue: 0,
      duration: 200,
      easing: MOTION.in,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setArchiveScreen("list");
    });
  }, [archiveCalAnim]);

  const edgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          !draggingRef.current &&
          gestureState.dx < -8 &&
          Math.abs(gestureState.dy) < Math.abs(gestureState.dx) * 0.8
        );
      },
      onPanResponderGrant: () => {},
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -48) {
          openArchiveRef.current?.();
        }
      },
      onPanResponderTerminate: () => {},
    }),
  ).current;

  const archiveSwipePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dx > 10 && Math.abs(gs.dy) < Math.abs(gs.dx) * 0.8,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 60) closeArchiveRef.current?.();
      },
      onPanResponderTerminate: () => {},
    }),
  ).current;

  const moveTask = (from, tid, to, toIndex) => {
    setTasks((prev) => {
      const fromList = prev[from];
      const fromIndex = fromList.findIndex((item) => item.id === tid);
      if (fromIndex === -1) return prev;
      const task = fromList[fromIndex];
      const nextFrom = fromList.filter((item) => item.id !== tid);
      const nextToBase = from === to ? nextFrom : [...prev[to]];
      let insertAt = Number.isInteger(toIndex) ? toIndex : nextToBase.length;
      insertAt = Math.max(0, Math.min(nextToBase.length, insertAt));
      const nextTo = [...nextToBase];
      nextTo.splice(insertAt, 0, task);
      return {
        ...prev,
        [from]:
          from === to ? orderTasksByDone(nextTo) : orderTasksByDone(nextFrom),
        ...(from === to ? {} : { [to]: orderTasksByDone(nextTo) }),
      };
    });
  };

  const saveComposer = () => {
    const text = addVal.trim();
    if (!text || !composer) return;
    if (composer.taskId) {
      const originalTask = tasks[composer.qid]?.find((t) => t.id === composer.taskId);
      if (originalTask) {
        const nothingChanged =
          text === originalTask.text &&
          repeat === (originalTask.repeat ?? false) &&
          deadline === (originalTask.deadline ?? null);
        if (nothingChanged) {
          closeComposer();
          return;
        }
      }
      if (originalTask && (originalTask.repeat || originalTask.deadline)) {
        const currentDayKey = viewingDayKeyRef.current || getLocalDayKey();
        const appearsElsewhere = historyRef.current.some(
          (entry) =>
            entry.dayKey !== currentDayKey &&
            QUADS.some((q) => (entry.tasks[q.id] || []).some((t) => t.id === originalTask.id)),
        );
        if (appearsElsewhere) {
          setEditConflict({ qid: composer.qid, taskId: composer.taskId, text, newRepeat: repeat, newDeadline: deadline });
          return;
        }
      }
      setTasks((prev) => ({
        ...prev,
        [composer.qid]: prev[composer.qid].map((task) =>
          task.id === composer.taskId ? { ...task, text, repeat, deadline } : task,
        ),
      }));
    } else {
      const id = nextId;
      const newTask = { id, text, done: false, repeat, deadline };
      const updatedTasks = {
        ...tasksRef.current,
        [composer.qid]: orderTasksByDone([...tasksRef.current[composer.qid], newTask]),
      };
      setTasks(updatedTasks);
      setNextId(id + 1);
      // Immediately sync history so repeat propagation works when navigating away
      const vdk = viewingDayKeyRef.current;
      if (vdk && repeat) {
        const nextHistory = upsertHistoryEntry(historyRef.current, vdk, updatedTasks);
        historyRef.current = nextHistory;
      }
    }
    closeComposer();
  };

  const applyEditThisOnly = useCallback(() => {
    if (!editConflict) return;
    const { qid, taskId, text, newRepeat, newDeadline } = editConflict;
    const newId = nextId;
    setNextId(newId + 1);
    setTasks((prev) => ({
      ...prev,
      [qid]: prev[qid].map((task) =>
        task.id === taskId
          ? { ...task, id: newId, text, repeat: newRepeat, deadline: newDeadline }
          : task,
      ),
    }));
    setEditConflict(null);
    closeComposer();
  }, [editConflict, nextId, closeComposer]);

  const applyEditAll = useCallback(() => {
    if (!editConflict) return;
    const { qid, taskId, text, newRepeat, newDeadline } = editConflict;
    const currentDayKey = viewingDayKeyRef.current || getLocalDayKey();

    // Determine if the task should be removed from the current view:
    // repeat+deadline task whose deadline is now before the current day.
    const removedFromCurrent = newRepeat && newDeadline && newDeadline < currentDayKey;
    setTasks((prev) => ({
      ...prev,
      [qid]: removedFromCurrent
        ? prev[qid].filter((t) => t.id !== taskId)
        : prev[qid].map((t) =>
            t.id === taskId ? { ...t, text, repeat: newRepeat, deadline: newDeadline } : t,
          ),
    }));

    const nextHistory = historyRef.current.map((entry) => {
      const inEntry = QUADS.some((q) => (entry.tasks[q.id] || []).some((t) => t.id === taskId));
      if (!inEntry) return entry;

      const isFuture = entry.dayKey > currentDayKey;
      // Remove from future entries when:
      //  - repeat was turned off (future copies only existed via propagation), OR
      //  - repeat+deadline but this entry is beyond the new deadline
      const removeFromEntry =
        isFuture && (!newRepeat || (newRepeat && newDeadline && entry.dayKey > newDeadline));

      const updatedTasks = QUADS.reduce((acc, q) => {
        if (removeFromEntry) {
          acc[q.id] = (entry.tasks[q.id] || []).filter((t) => t.id !== taskId);
        } else {
          acc[q.id] = (entry.tasks[q.id] || []).map((t) =>
            t.id === taskId ? { ...t, text, repeat: newRepeat, deadline: newDeadline } : t,
          );
        }
        return acc;
      }, { ...entry.tasks });

      const total = QUADS.reduce((s, q) => s + updatedTasks[q.id].length, 0);
      return { ...entry, tasks: updatedTasks, total };
    });

    historyRef.current = nextHistory;
    setHistory(nextHistory);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)).catch(() => {});
    setEditConflict(null);
    closeComposer();
  }, [editConflict, closeComposer]);

  const moveTaskToDate = useCallback((targetDayKey) => {
    if (!composer?.taskId) return;
    const { taskId, qid } = composer;
    const task = tasksRef.current[qid]?.find((t) => t.id === taskId);
    if (!task) { setMovePickerOpen(false); closeComposer(); return; }

    // Add task to target day's history entry
    const targetEntry = historyRef.current.find((e) => e.dayKey === targetDayKey);
    const targetTasks = targetEntry ? normalizeTasks(targetEntry.tasks) : createEmptyTasks();
    if (!targetTasks[qid].some((t) => t.id === taskId)) {
      targetTasks[qid] = [...targetTasks[qid], { ...task, done: false }];
    }
    const nextHistory = upsertHistoryEntry(historyRef.current, targetDayKey, targetTasks);
    historyRef.current = nextHistory;
    setHistory(nextHistory);

    // Remove task from current day (persist useEffect will pick up the new historyRef)
    setTasks((prev) => ({ ...prev, [qid]: prev[qid].filter((t) => t.id !== taskId) }));

    // Persist immediately so the target day is saved before the debounced persist fires
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)).catch(() => {});

    setMovePickerOpen(false);
    closeComposer();
  }, [composer, closeComposer]);

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
      left: Math.max(
        12,
        Math.min(
          x - (rect.x || 0) - width / 2,
          (rect.width || 430) - width - 12,
        ),
      ),
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

  const endDrag = (cancelled) => {
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
    const target = cancelled
      ? dropTargetRef.current
      : resolveDragTarget(current.x, current.y, true);
    stopAutoScroll();
    draggingRef.current = null;
    dropTargetRef.current = null;
    lastGhostPoint.current = null;

    if (!cancelled && target?.type === "trash") {
      deleteTask(current.from, current.task.id);
    } else if (!cancelled && target?.type === "quad") {
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

  const activeComposer = composer
    ? QUADS.find((q) => q.id === composer.qid)
    : null;
  const activeComposerColor = composer ? COLORS[composer.qid] : null;
  const composerMode = composer?.taskId ? "Edit task" : "New task";
  const shellWidth =
    shellRect.current.width || Math.min(windowWidth || 430, 430);
  const dragGhostWidth = Math.max(132, Math.min(172, shellWidth / 2 - 28));

  const getDropMarkerTop = (qid, index) => {
    if (!Number.isInteger(index)) return null;

    const layouts = taskLayouts.current[qid] || {};
    const scrollOffset = taskScrollOffsets.current[qid] || 0;
    const { slots, totalHeight } = getVirtualDropSlots(
      tasks[qid] || [],
      qid,
      null,
      layouts,
    );
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

  const topRowH = shellHeight > 0
    ? (shellHeight + 16 + insets.top) / 2
    : undefined;
  const bottomRowH = shellHeight > 0
    ? (shellHeight - 16 - insets.top) / 2
    : undefined;

  return (
    <View style={styles.root}>
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <Animated.View
        ref={shellRef}
        collapsable={false}
        onLayout={handleShellLayout}
        style={[styles.shell, shellHeight > 0 && { minHeight: shellHeight }, { opacity: matrixOpacityAnim }]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(0,0,0,0.38)", "rgba(0,0,0,0.10)", "rgba(0,0,0,0)"]}
          style={[styles.statusBarGradient, { height: insets.top + 28 }]}
        />

        {(() => {
          const { label, dateStr } = formatPillParts(viewingDayKey);
          const pillText = (
            <Text numberOfLines={1} style={styles.datePillText}>
              {label ? <Text style={styles.datePillTodayLabel}>{label}</Text> : null}
              {label ? <Text style={styles.datePillSep}>{" · "}</Text> : null}
              {dateStr}
            </Text>
          );
          return viewingDayKey ? (
            <Pressable
              onPress={goToToday}
              style={[styles.datePillContainer, { top: insets.top + 5 }]}
            >
              {pillText}
            </Pressable>
          ) : (
            <View
              pointerEvents="none"
              style={[styles.datePillContainer, { top: insets.top + 5 }]}
            >
              {pillText}
            </View>
          );
        })()}

        <Pressable
          onPress={() => setSortByDeadline((s) => !s)}
          style={({ pressed }) => [styles.sortBtn, { top: insets.top + 4 }, pressed && styles.pressed]}
          hitSlop={8}
        >
          <Text style={[
            styles.sortBtnText,
            { color: sortByDeadline ? INK : "rgba(22,22,22,0.36)" },
          ]}>
            {"⇅"}
          </Text>
        </Pressable>

        <View testID="matrix-gesture-layer" style={styles.safeLayer} {...edgePanResponder.panHandlers}>
          <View style={styles.grid}>
            {[QUADS.slice(0, 2), QUADS.slice(2, 4)].map((row, rowIdx) => (
              <View
                key={rowIdx}
                style={[
                  styles.gridRow,
                  rowIdx === 0 && topRowH !== undefined && { height: topRowH },
                  rowIdx === 1 && bottomRowH !== undefined && { height: bottomRowH },
                ]}
              >
                {row.map((q) => {
                  const qTasks = sortByDeadline
                    ? [...tasks[q.id]].sort((a, b) => {
                        if (a.done !== b.done) return a.done ? 1 : -1;
                        if (!a.deadline && !b.deadline) return 0;
                        if (!a.deadline) return 1;
                        if (!b.deadline) return -1;
                        return a.deadline.localeCompare(b.deadline);
                      })
                    : tasks[q.id];
                  return (
                  <QuadrantTile
                    key={q.id}
                    q={q}
                    color={COLORS[q.id]}
                    tasks={qTasks}
                    topInset={insets.top}
                    dropMarkerTop={
                      dropTarget === q.id ? getDropMarkerTop(q.id, dropIndex) : null
                    }
                    draggingTaskId={dragging?.task.id || null}
                    draggingActive={!!dragging}
                    setQuadRef={(node) => {
                      quadRefs.current[q.id] = node;
                    }}
                    setTaskAreaRef={(node) => {
                      taskAreaRefs.current[q.id] = node;
                    }}
                    setTaskListRef={(node) => {
                      taskListRefs.current[q.id] = node;
                    }}
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
                  );
                })}
              </View>
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
                transform: [
                  {
                    translateY: trashAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [DELETE_TARGET_HEIGHT + insets.bottom, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.trashDrop,
                {
                  transform: [
                    {
                      scaleY: deleteHotAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.08],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Animated.View
                style={[styles.trashDropHot, { opacity: deleteHotAnim }]}
              />
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
                  transform: [
                    {
                      translateY: undoAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [18, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.undoText}>Task deleted</Text>
              <Pressable onPress={undoDelete} style={({ pressed }) => [styles.undoButton, pressed && styles.pressed]}>
                <Text style={styles.undoButtonText}>Undo</Text>
              </Pressable>
            </Animated.View>
          )}
        </View>

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
                  {
                    scale: dragAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
                borderColor: "rgba(22,22,22,0.08)",
              },
            ]}
          >
            <Text
              style={[
                styles.dragGhostText,
                { color: COLORS[dragging.from].fg },
              ]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {dragging.task.text}
            </Text>
          </Animated.View>
        )}

        {composer && activeComposer && (
          <SafeAreaView
            testID="task-composer"
            style={styles.composerSafe}
            edges={["top", "right", "left"]}
          >
            <AnimatedPressable
              accessibilityLabel="Close task editor"
              testID="task-composer-backdrop"
              onPress={handleComposerBackdropPress}
              style={[
                styles.composerBackdrop,
                {
                  opacity: composerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
                },
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
                    transform: [
                      {
                        translateY: composerAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [22, 0],
                        }),
                      },
                    ],
                  },
                  composerPanelBg(composer.qid),
                  composerBorder(composer.qid),
                ]}
              >
                <Text
                  style={[
                    styles.composerLabel,
                    { color: activeComposerColor.muted },
                  ]}
                >
                  {activeComposer.title.toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.composerTitle,
                    { color: activeComposerColor.fg },
                  ]}
                >
                  {composerMode}
                </Text>
                <View style={styles.composerRow}>
                  <TextInput
                    accessibilityLabel="Task name"
                    testID="task-composer-input"
                    value={addVal}
                    onChangeText={setAddVal}
                    onSubmitEditing={saveComposer}
                    placeholder="Task name..."
                    placeholderTextColor={
                      composer.qid === "q1"
                        ? "rgba(255,255,255,0.35)"
                        : "rgba(22,22,22,0.38)"
                    }
                    returnKeyType="done"
                    style={[
                      styles.addInput,
                      addInputBg(composer.qid),
                      { color: activeComposerColor.fg },
                    ]}
                    autoFocus
                  />
                  <View style={styles.composerChipsRow}>
                    <Pressable
                      onPress={() => setRepeat((r) => !r)}
                      style={({ pressed }) => [
                        styles.composerChip,
                        composerChipStyle(composer.qid, repeat),
                        pressed && { opacity: 0.72 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.composerChipText,
                          {
                            color: repeat
                              ? activeComposerColor.fg
                              : activeComposerColor.muted,
                          },
                        ]}
                      >
                        {"↺  Repeat"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setDeadlinePickerOpen((o) => !o)}
                      style={({ pressed }) => [
                        styles.composerChip,
                        composerChipStyle(composer.qid, !!deadline),
                        pressed && { opacity: 0.72 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.composerChipText,
                          {
                            color: deadline
                              ? activeComposerColor.fg
                              : activeComposerColor.muted,
                          },
                        ]}
                      >
                        {deadline
                          ? `Due: ${formatDeadlineShort(deadline)}`
                          : "Deadline"}
                      </Text>
                    </Pressable>
                    {composer.taskId && !repeat && (
                      <Pressable
                        onPress={() => { setMovePickerOpen((o) => !o); setDeadlinePickerOpen(false); }}
                        style={({ pressed }) => [
                          styles.composerChip,
                          composerChipStyle(composer.qid, movePickerOpen),
                          pressed && { opacity: 0.72 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.composerChipText,
                            { color: movePickerOpen ? activeComposerColor.fg : activeComposerColor.muted },
                          ]}
                        >
                          {"Move to…"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  {deadlinePickerOpen && (
                    <DeadlinePicker
                      value={deadline}
                      quadId={composer.qid}
                      onChange={(d) => { setDeadline(d); }}
                      onClose={() => setDeadlinePickerOpen(false)}
                      minDate={viewingDayKey || undefined}
                    />
                  )}
                  {movePickerOpen && composer.taskId && !repeat && (
                    <DeadlinePicker
                      value={null}
                      quadId={composer.qid}
                      onChange={(d) => { if (d) moveTaskToDate(d); }}
                      onClose={() => setMovePickerOpen(false)}
                      minDate={null}
                      maxDate={deadline || undefined}
                    />
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      composer.taskId ? "Save task" : "Add task"
                    }
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
                    <Text
                      style={[
                        styles.addButtonText,
                        { color: composer.qid === "q1" ? INK : "#fff" },
                      ]}
                    >
                      Save
                    </Text>
                  </Pressable>
                </View>
              </Animated.View>
            </KeyboardStickyView>
          </SafeAreaView>
        )}

        {archiveOpen && (
          <>
            <AnimatedPressable
              style={[styles.archiveBackdrop, { opacity: archiveAnim }]}
              onPress={() => closeArchive()}
            />
            <Animated.View
              style={[
                styles.archivePanel,
                {
                  transform: [
                    {
                      translateX: archiveAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [windowWidth * 0.82, 0],
                      }),
                    },
                  ],
                },
              ]}
              {...archiveSwipePanResponder.panHandlers}
            >
              <SafeAreaView
                edges={["top", "right"]}
                style={styles.archivePanelInner}
              >
                {/* ── LIST ── */}
                {archiveScreen === "list" && (() => {
                  const filtered = history.filter((e) => e.total > 0);
                  return (
                    <>
                      <View style={styles.archivePanelHeaderRow}>
                        <Text style={styles.archiveHeading}>Archive</Text>
                        <Pressable
                          onPress={handleArchiveAddDate}
                          style={({ pressed }) => [styles.archiveAddBtn, pressed && styles.pressed]}
                          hitSlop={10}
                        >
                          <Ionicons name="add" size={22} color="rgba(255,255,255,0.55)" />
                        </Pressable>
                      </View>
                      {filtered.length === 0 ? (
                        <Text style={styles.archiveEmpty}>No archive yet</Text>
                      ) : (
                        <FlatList
                          data={filtered}
                          keyExtractor={(item) => item.dayKey}
                          renderItem={({ item, index }) => (
                            <ArchiveListItem
                              item={item}
                              index={index}
                              onPress={() => loadDayToMainScreen(item.dayKey)}
                              onDelete={() => deleteHistoryEntry(item.dayKey)}
                              onSwipeOpen={(closeFn) => {
                                openArchiveItemRef.current?.();
                                openArchiveItemRef.current = closeFn;
                              }}
                            />
                          )}
                          showsVerticalScrollIndicator={false}
                          contentContainerStyle={styles.archiveList}
                        />
                      )}
                    </>
                  );
                })()}

                {/* ── CALENDAR ── */}
                {archiveScreen === "calendar" && (
                  <Animated.View
                    style={[
                      { flex: 1 },
                      {
                        opacity: archiveCalAnim,
                        transform: [
                          {
                            translateX: archiveCalAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [48, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <ArchiveCalendar
                      historyDayKeys={history
                        .filter((e) => e.total > 0)
                        .map((e) => e.dayKey)}
                      onSelect={handleCalendarSelect}
                      onBack={handleCalendarBack}
                    />
                  </Animated.View>
                )}
              </SafeAreaView>
            </Animated.View>
          </>
        )}

        {editConflict && (
          <>
            <Pressable
              style={styles.editConflictBackdrop}
              onPress={() => { setEditConflict(null); closeComposer(); }}
            />
            <KeyboardStickyView
              pointerEvents="box-none"
              offset={{ closed: 0, opened: 0 }}
              style={styles.editConflictKeyboard}
            >
            <Animated.View
              style={[
                styles.editConflictCard,
                composerPanelBg(editConflict.qid),
                composerBorder(editConflict.qid),
                {
                  opacity: conflictAnim,
                  transform: [
                    {
                      translateY: conflictAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [24, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={[styles.editConflictTitle, { color: COLORS[editConflict.qid].fg }]}>
                Edit recurring task
              </Text>
              <Text style={[styles.editConflictSub, { color: COLORS[editConflict.qid].muted }]}>
                This task repeats or has a deadline. What would you like to change?
              </Text>
              <Pressable
                onPress={applyEditThisOnly}
                style={({ pressed }) => [styles.editConflictOption, pressed && styles.pressed]}
              >
                <View
                  style={[
                    styles.editConflictOptionInner,
                    {
                      borderColor:
                        editConflict.qid === "q1"
                          ? "rgba(255,255,255,0.14)"
                          : "rgba(22,22,22,0.12)",
                    },
                  ]}
                >
                  <Text style={[styles.editConflictOptionLabel, { color: COLORS[editConflict.qid].fg }]}>
                    Only this task
                  </Text>
                  <Text style={[styles.editConflictOptionSub, { color: COLORS[editConflict.qid].muted }]}>
                    Changes apply to this occurrence only
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={applyEditAll}
                style={({ pressed }) => [styles.editConflictOption, pressed && styles.pressed]}
              >
                <View
                  style={[
                    styles.editConflictOptionInner,
                    {
                      borderColor:
                        editConflict.qid === "q1"
                          ? "rgba(255,255,255,0.14)"
                          : "rgba(22,22,22,0.12)",
                    },
                  ]}
                >
                  <Text style={[styles.editConflictOptionLabel, { color: COLORS[editConflict.qid].fg }]}>
                    All tasks
                  </Text>
                  <Text style={[styles.editConflictOptionSub, { color: COLORS[editConflict.qid].muted }]}>
                    Update this and all related tasks in history
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => { setEditConflict(null); closeComposer(); }}
                style={({ pressed }) => [styles.editConflictCancel, pressed && styles.pressed]}
              >
                <Text style={[styles.editConflictCancelText, { color: COLORS[editConflict.qid].muted }]}>
                  Cancel
                </Text>
              </Pressable>
            </Animated.View>
            </KeyboardStickyView>
          </>
        )}

        {deleteConflict && (
          <>
            <Pressable
              style={styles.editConflictBackdrop}
              onPress={() => setDeleteConflict(null)}
            />
            <KeyboardStickyView
              pointerEvents="box-none"
              offset={{ closed: 0, opened: 0 }}
              style={styles.editConflictKeyboard}
            >
            <Animated.View
              style={[
                styles.editConflictCard,
                composerPanelBg(deleteConflict.qid),
                composerBorder(deleteConflict.qid),
                {
                  opacity: deleteConflictAnim,
                  transform: [{ translateY: deleteConflictAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
                },
              ]}
            >
              <Text style={[styles.editConflictTitle, { color: COLORS[deleteConflict.qid].fg }]}>
                Delete task
              </Text>
              <Text style={[styles.editConflictSub, { color: COLORS[deleteConflict.qid].muted }]}>
                This task appears on multiple days. How would you like to delete it?
              </Text>
              <Pressable
                onPress={confirmDeleteThisOnly}
                style={({ pressed }) => [styles.editConflictOption, pressed && styles.pressed]}
              >
                <View style={[styles.editConflictOptionInner, { borderColor: deleteConflict.qid === "q1" ? "rgba(255,255,255,0.14)" : "rgba(22,22,22,0.12)" }]}>
                  <Text style={[styles.editConflictOptionLabel, { color: COLORS[deleteConflict.qid].fg }]}>
                    Only this day
                  </Text>
                  <Text style={[styles.editConflictOptionSub, { color: COLORS[deleteConflict.qid].muted }]}>
                    Remove from this day only, keep all other days
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={confirmDeleteFromHere}
                style={({ pressed }) => [styles.editConflictOption, pressed && styles.pressed]}
              >
                <View style={[styles.editConflictOptionInner, { borderColor: deleteConflict.qid === "q1" ? "rgba(255,255,255,0.14)" : "rgba(22,22,22,0.12)" }]}>
                  <Text style={[styles.editConflictOptionLabel, { color: COLORS[deleteConflict.qid].fg }]}>
                    This day and forward
                  </Text>
                  <Text style={[styles.editConflictOptionSub, { color: COLORS[deleteConflict.qid].muted }]}>
                    Remove from this day and all future days
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={confirmDeleteAll}
                style={({ pressed }) => [styles.editConflictOption, pressed && styles.pressed]}
              >
                <View style={[styles.editConflictOptionInner, { borderColor: deleteConflict.qid === "q1" ? "rgba(255,255,255,0.14)" : "rgba(22,22,22,0.12)" }]}>
                  <Text style={[styles.editConflictOptionLabel, { color: COLORS[deleteConflict.qid].fg }]}>
                    Delete everywhere
                  </Text>
                  <Text style={[styles.editConflictOptionSub, { color: COLORS[deleteConflict.qid].muted }]}>
                    Remove from all days including past
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => setDeleteConflict(null)}
                style={({ pressed }) => [styles.editConflictCancel, pressed && styles.pressed]}
              >
                <Text style={[styles.editConflictCancelText, { color: COLORS[deleteConflict.qid].muted }]}>
                  Cancel
                </Text>
              </Pressable>
            </Animated.View>
            </KeyboardStickyView>
          </>
        )}

      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          styles.splashOverlay,
          { opacity: splashOpacityAnim },
        ]}
      >
        {(() => {
          const splashSize = Math.min(windowWidth || 390, windowHeight || 844) * SPLASH_GRID_RATIO;
          const splashRadius = splashSize * SPLASH_RADIUS_RATIO;
          return (
            <Animated.View style={{ transform: [{ scale: splashScaleAnim }] }}>
              <View style={[styles.splashLogo, { width: splashSize, height: splashSize, borderRadius: splashRadius }]}>
                <View style={styles.splashRow}>
                  <View style={[styles.splashCell, { backgroundColor: COLORS.q1.bg }]} />
                  <View style={[styles.splashCell, { backgroundColor: COLORS.q2.bg }]} />
                </View>
                <View style={styles.splashRow}>
                  <View style={[styles.splashCell, { backgroundColor: COLORS.q3.bg }]} />
                  <View style={[styles.splashCell, { backgroundColor: COLORS.q4.bg }]} />
                </View>
              </View>
            </Animated.View>
          );
        })()}
      </Animated.View>
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
  if (quadId === "q1") return { borderColor: "rgba(255,255,255,0.16)" };
  return { borderColor: "rgba(22,22,22,0.08)" };
}

function addInputBg(quadId) {
  if (quadId === "q1") return { backgroundColor: "rgba(255,255,255,0.1)" };
  return { backgroundColor: "rgba(22,22,22,0.06)" };
}

function addButtonBg(quadId) {
  if (quadId === "q1") return { backgroundColor: "rgba(255,255,255,0.92)" };
  return { backgroundColor: INK };
}

function composerChipStyle(quadId, isActive) {
  if (isActive) {
    return quadId === "q1"
      ? { backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "transparent" }
      : { backgroundColor: "rgba(22,22,22,0.12)", borderWidth: 1, borderColor: "transparent" };
  }
  return quadId === "q1"
    ? { borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" }
    : { borderWidth: 1, borderColor: "rgba(22,22,22,0.16)" };
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: APP_SURFACE,
  },
  root: {
    flex: 1,
    backgroundColor: INK,
    alignItems: "center",
  },
  loading: {
    flex: 1,
    backgroundColor: APP_SURFACE,
  },
  shell: {
    flex: 1,
    width: "100%",
    maxWidth: 430,
    backgroundColor: APP_SURFACE,
    overflow: "hidden",
  },
  safeLayer: {
    flex: 1,
    position: "relative",
  },
  grid: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: APP_SURFACE,
  },
  gridRow: {
    flex: 1,
    flexDirection: "row",
  },
  tile: {
    width: "50%",
    overflow: "hidden",
    borderWidth: 0,
  },
  dropOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  dropOverlayLine: {
    position: "absolute",
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
    position: "absolute",
    left: 10,
    right: 10,
    height: 10,
    justifyContent: "center",
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
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
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
    flexDirection: "row",
    alignItems: "center",
  },
  miniTaskDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.16)",
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
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircle: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.4,
    alignItems: "center",
    justifyContent: "center",
  },
  miniText: {
    flex: 1,
    ...TYPE.task,
    textAlignVertical: "center",
  },
  miniDragArea: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
  },
  miniDragAreaRoomy: {
    paddingVertical: 2,
  },
  doneText: {
    textDecorationLine: "line-through",
  },
  tileEmpty: {
    display: "none",
  },
  emptyAddFooter: {
    flexGrow: 1,
  },
  emptyAddZone: {
    flex: 1,
    minHeight: 78,
  },
  deleteTarget: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    zIndex: 20,
  },
  trashDrop: {
    width: "100%",
    height: DELETE_BAR_HEIGHT,
    backgroundColor: DANGER_SOFT,
    overflow: "hidden",
  },
  trashDropHot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: DANGER,
  },
  dragGhost: {
    position: "absolute",
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
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 14,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: INK,
    paddingLeft: 15,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 30,
  },
  undoText: {
    color: "#fff",
    ...TYPE.button,
  },
  undoButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  undoButtonText: {
    color: INK,
    ...TYPE.button,
  },
  composerSafe: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 16,
  },
  composerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(22,22,22,0.10)",
  },
  composerKeyboard: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  composerPanel: {
    marginHorizontal: 10,
    marginBottom: COMPOSER_BOTTOM_GAP,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    width: "auto",
    shadowColor: INK,
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  composerLabel: {
    ...TYPE.tileMeta,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  composerTitle: {
    fontFamily: "Nunito_800ExtraBold",
    fontSize: 18,
    lineHeight: 23,
    marginBottom: 12,
  },
  composerRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  addInput: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontFamily: "Nunito_600SemiBold",
    fontSize: 15,
    lineHeight: 19,
  },
  composerChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  composerChip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  composerChipText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 11,
    lineHeight: 15,
  },
  addButton: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonDisabled: {
    opacity: 0.3,
  },
  addButtonText: {
    fontFamily: "Nunito_900Black",
    fontSize: 13,
    lineHeight: 17,
  },
  archiveBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.46)",
    zIndex: 40,
  },
  archivePanel: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "82%",
    backgroundColor: "#0E0E0E",
    zIndex: 50,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: -4, height: 0 },
  },
  archivePanelInner: {
    flex: 1,
  },
  archiveHeading: {
    color: "#FFFFFF",
    ...TYPE.screenTitle,
  },
  archiveEmpty: {
    color: "rgba(255,255,255,0.28)",
    ...TYPE.rowMeta,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  archiveList: {
    paddingBottom: 32,
  },
  archiveEntryFirst: {},
  archiveEntry: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 13,
    marginHorizontal: 10,
    borderRadius: 12,
  },
  archiveEntryPressed: {
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  archiveEntryLeft: {
    flex: 1,
  },
  archiveEntryDate: {
    color: "#FFFFFF",
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
    lineHeight: 18,
  },
  archiveEntryDateMuted: {
    color: "rgba(255,255,255,0.36)",
  },
  archiveEntryCount: {
    color: "rgba(255,255,255,0.38)",
    ...TYPE.rowMeta,
    marginTop: 2,
  },

  // status bar gradient
  statusBarGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 8,
  },

  // sort button
  sortBtn: {
    position: "absolute",
    right: 14,
    zIndex: 10,
    padding: 4,
  },
  sortBtnText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 13,
    lineHeight: 17,
  },

  // date pill
  datePillContainer: {
    position: "absolute",
    left: 14,
    right: 60,
    zIndex: 10,
  },
  datePillText: {
    color: "rgba(255,255,255,0.88)",
    fontFamily: "Nunito_700Bold",
    fontSize: 10,
    lineHeight: 14,
  },
  datePillSep: {
    color: "rgba(255,255,255,0.28)",
    fontFamily: "Nunito_700Bold",
    fontSize: 10,
    lineHeight: 14,
  },
  datePillTodayLabel: {
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Nunito_700Bold",
    fontSize: 10,
    lineHeight: 14,
  },

  // repeat
  miniTaskNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  // deadline
  deadlineLabel: {
    ...TYPE.tileMeta,
    marginTop: 1,
  },
  deadlinePicker: {
    marginTop: 4,
    borderRadius: 10,
    overflow: "hidden",
  },
  deadlinePickerNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  deadlinePickerNavBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  deadlinePickerNavText: {
    fontSize: 20,
    lineHeight: 24,
    fontFamily: "Nunito_700Bold",
  },
  deadlinePickerMonthLabel: {
    ...TYPE.composerMeta,
    flex: 1,
    textAlign: "center",
  },
  deadlinePickerDowRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  deadlinePickerDow: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Nunito_700Bold",
    fontSize: 9,
    lineHeight: 16,
  },
  deadlinePickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  deadlinePickerCell: {
    width: "14.285%",
    alignItems: "center",
    paddingVertical: 2,
  },
  deadlinePickerDayInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  deadlinePickerTodayRing: {
    borderWidth: 1.5,
    borderColor: "currentColor",
  },
  deadlinePickerDayText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 11,
    lineHeight: 16,
  },
  deadlineClearBtn: {
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  deadlineClearBtnText: {
    ...TYPE.smallButton,
  },

  // archive panel header row
  archivePanelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 10,
  },
  archiveAddBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  archiveBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -4,
  },

  // archive list item with swipe-to-delete
  archiveItemWrap: {
    position: "relative",
    overflow: "hidden",
  },
  archiveItemDeleteBack: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: ARCHIVE_DELETE_WIDTH,
    backgroundColor: DANGER,
    alignItems: "center",
    justifyContent: "center",
  },
  archiveItemDeleteBtn: {
    flex: 1,
    width: ARCHIVE_DELETE_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  archiveItemFront: {
    backgroundColor: "#0E0E0E",
  },

  // archive calendar
  archiveCalMonthLabel: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: "Nunito_800ExtraBold",
    fontSize: 16,
    lineHeight: 20,
    marginLeft: 10,
  },
  archiveCalNavGroup: {
    flexDirection: "row",
    gap: 4,
  },
  archiveCalNav: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  archiveCalBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  archiveCalDowRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  archiveCalDow: {
    flex: 1,
    textAlign: "center",
    color: "rgba(255,255,255,0.28)",
    fontFamily: "Nunito_700Bold",
    fontSize: 10,
    lineHeight: 18,
    letterSpacing: 0.4,
  },
  archiveCalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  archiveCalCell: {
    width: "14.285%",
    alignItems: "center",
    paddingVertical: 3,
  },
  archiveCalDayInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  archiveCalDayHasEntry: {
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  archiveCalDayToday: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.55)",
  },
  archiveCalDayText: {
    color: "rgba(255,255,255,0.60)",
    fontFamily: "Nunito_700Bold",
    fontSize: 13,
    lineHeight: 18,
  },
  archiveCalDayTextHasEntry: {
    color: "#FFFFFF",
  },
  archiveCalDayTextToday: {
    color: "#FFFFFF",
  },
  archiveCalDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFE68A",
    marginTop: 1,
  },

  // edit conflict overlay
  editConflictBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.52)",
    zIndex: 60,
  },
  editConflictKeyboard: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 70,
  },
  editConflictCard: {
    marginHorizontal: 10,
    marginBottom: COMPOSER_BOTTOM_GAP,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: INK,
    shadowOpacity: 0.20,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  editConflictTitle: {
    fontFamily: "Nunito_800ExtraBold",
    fontSize: 16,
    lineHeight: 21,
    marginBottom: 4,
  },
  editConflictSub: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 14,
  },
  editConflictOption: {
    marginBottom: 8,
  },
  editConflictOptionInner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  editConflictOptionLabel: {
    fontFamily: "Nunito_700Bold",
    fontSize: 13,
    lineHeight: 17,
  },
  editConflictOptionSub: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  editConflictCancel: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 2,
  },
  editConflictCancelText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 12,
    lineHeight: 16,
  },

  // splash
  splashOverlay: {
    zIndex: 100,
    backgroundColor: APP_SURFACE,
    alignItems: "center",
    justifyContent: "center",
  },
  splashLogo: {
    overflow: "hidden",
  },
  splashRow: {
    flex: 1,
    flexDirection: "row",
  },
  splashCell: {
    flex: 1,
  },
});
