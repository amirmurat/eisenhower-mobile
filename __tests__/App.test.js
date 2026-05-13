import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import App from '../App';

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

  test('exposes a full-screen drawer gesture layer without a visible handle fallback', async () => {
    render(<App />);

    const gestureLayer = await screen.findByTestId('matrix-gesture-layer');

    expect(typeof gestureLayer.props.onMoveShouldSetResponderCapture).toBe('function');
    expect(typeof gestureLayer.props.onResponderMove).toBe('function');
    expect(screen.queryByTestId('edge-drawer-hitbox')).not.toBeOnTheScreen();
  });
});
