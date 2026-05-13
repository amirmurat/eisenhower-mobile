import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import App from '../App';

const STORAGE_KEY = 'eisenhower-mobile.tasks.v1';
const HISTORY_KEY = 'eisenhower-mobile.history.v1';
const ACTIVE_DAY_KEY = 'eisenhower-mobile.activeDay.v1';

function dayKeyForOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('task composer', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('adds a task from an empty quadrant area', async () => {
    render(<App />);

    fireEvent.press(await screen.findByTestId('quadrant-q2-empty-add-zone'));

    const input = await screen.findByLabelText('Task name');
    fireEvent.changeText(input, 'New keyboard task');
    fireEvent.press(screen.getByRole('button', { name: 'Add task' }));

    expect(await screen.findByText('New keyboard task')).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.queryByTestId('task-composer')).not.toBeOnTheScreen();
    });
  });

  test('edits a task by pressing the task text area', async () => {
    render(<App />);

    fireEvent.press(await screen.findByRole('button', { name: 'Edit task: Read the strategy book' }));

    const input = await screen.findByLabelText('Task name');
    expect(input).toHaveDisplayValue('Read the strategy book');

    fireEvent.changeText(input, 'Edited strategy task');
    fireEvent.press(screen.getByRole('button', { name: 'Save task' }));

    expect(await screen.findByText('Edited strategy task')).toBeOnTheScreen();
    expect(screen.queryByText('Read the strategy book')).not.toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.queryByTestId('task-composer')).not.toBeOnTheScreen();
    });
  });

  test('keeps composer controls full width on narrow mobile screens', async () => {
    render(<App />);

    fireEvent.press(await screen.findByTestId('quadrant-q2-empty-add-zone'));

    expect(await screen.findByTestId('task-composer-input')).toHaveStyle({ width: '100%' });
    expect(screen.getByTestId('task-composer-save')).toHaveStyle({ width: '100%' });
  });

  test('saves non-empty composer text when backdrop is pressed', async () => {
    render(<App />);

    fireEvent.press(await screen.findByTestId('quadrant-q2-empty-add-zone'));
    fireEvent.changeText(await screen.findByLabelText('Task name'), 'Backdrop saved task');
    fireEvent.press(screen.getByTestId('task-composer-backdrop'));

    expect(await screen.findByText('Backdrop saved task')).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.queryByTestId('task-composer')).not.toBeOnTheScreen();
    });
  });

  test('closes empty composer from backdrop without adding a task', async () => {
    render(<App />);

    expect(await screen.findAllByTestId(/^task-\d+$/)).toHaveLength(5);
    fireEvent.press(screen.getByTestId('quadrant-q2-empty-add-zone'));
    fireEvent.changeText(await screen.findByLabelText('Task name'), '   ');
    fireEvent.press(screen.getByTestId('task-composer-backdrop'));

    await waitFor(() => {
      expect(screen.queryByTestId('task-composer')).not.toBeOnTheScreen();
    });
    expect(screen.getAllByTestId(/^task-\d+$/)).toHaveLength(5);
  });

  test('lets Eliminate tasks toggle done with a normal square check', async () => {
    render(<App />);

    const eliminateText = await screen.findByText('Check social feeds');
    const eliminateCheck = screen.getByTestId('task-5-check');

    expect(eliminateText).not.toHaveStyle({ textDecorationLine: 'line-through' });
    expect(eliminateCheck).toBeEnabled();
    expect(eliminateCheck).toHaveProp('accessibilityState', { disabled: false, selected: false });

    fireEvent.press(eliminateCheck);

    expect(eliminateText).toHaveStyle({ textDecorationLine: 'line-through' });
    expect(eliminateCheck).toHaveProp('accessibilityState', { disabled: false, selected: true });

    fireEvent.press(eliminateCheck);

    expect(eliminateText).not.toHaveStyle({ textDecorationLine: 'line-through' });
    expect(eliminateCheck).toHaveProp('accessibilityState', { disabled: false, selected: false });
  });

  test('moves completed tasks below active tasks in the same quadrant', async () => {
    render(<App />);

    expect((await screen.findAllByTestId(/^task-[23]$/)).map(node => node.props.testID)).toEqual(['task-2', 'task-3']);

    fireEvent.press(screen.getByTestId('task-2-check'));

    await waitFor(() => {
      expect(screen.getAllByTestId(/^task-[23]$/).map(node => node.props.testID)).toEqual(['task-3', 'task-2']);
    });
  });

  test('removes the bottom divider from the last task in each list', async () => {
    render(<App />);

    expect(await screen.findByTestId('task-2')).toHaveStyle({ borderBottomWidth: StyleSheet.hairlineWidth });
    expect(screen.getByTestId('task-3')).not.toHaveStyle({ borderBottomWidth: StyleSheet.hairlineWidth });
  });

  test('keeps history navigation gesture-first without visible controls', async () => {
    render(<App />);

    const gestureLayer = await screen.findByTestId('matrix-gesture-layer');

    expect(gestureLayer).toBeOnTheScreen();
    expect(screen.queryByTestId('history-slide')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Show history' })).not.toBeOnTheScreen();
  });

  test('archives a stored previous day and starts the current day empty', async () => {
    const yesterday = dayKeyForOffset(-1);
    await AsyncStorage.setItem(ACTIVE_DAY_KEY, yesterday);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      q1: [{ id: 101, text: 'Yesterday urgent task', done: false }],
      q2: [],
      q3: [],
      q4: [],
    }));

    render(<App />);

    await waitFor(async () => {
      const rawHistory = await AsyncStorage.getItem(HISTORY_KEY);
      expect(JSON.parse(rawHistory)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          dayKey: yesterday,
          total: 1,
          tasks: expect.objectContaining({
            q1: [expect.objectContaining({ text: 'Yesterday urgent task' })],
          }),
        }),
      ]));
    });

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(ACTIVE_DAY_KEY)).toBe(dayKeyForOffset(0));
    });
    expect(screen.queryByText('Yesterday urgent task')).not.toBeOnTheScreen();
  });

  test('keeps the current day history entry updated automatically', async () => {
    render(<App />);

    fireEvent.press(await screen.findByTestId('quadrant-q2-empty-add-zone'));
    fireEvent.changeText(await screen.findByLabelText('Task name'), 'Live history task');
    fireEvent.press(screen.getByRole('button', { name: 'Add task' }));

    await waitFor(async () => {
      const rawHistory = await AsyncStorage.getItem(HISTORY_KEY);
      expect(JSON.parse(rawHistory)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          dayKey: dayKeyForOffset(0),
          tasks: expect.objectContaining({
            q2: expect.arrayContaining([
              expect.objectContaining({ text: 'Live history task' }),
            ]),
          }),
        }),
      ]));
    });
  });
});
