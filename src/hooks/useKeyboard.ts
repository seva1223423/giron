import { useEffect, useState } from 'react';
import { Keyboard, Platform, KeyboardEvent } from 'react-native';

interface KeyboardState {
  isVisible: boolean;
  height: number;
}

/**
 * Tracks software-keyboard visibility and height.
 *
 * Useful for:
 *   - lifting a floating action button above the keyboard
 *   - reserving space for keyboard accessory views
 *   - hiding bottom nav when typing
 *
 * Most form layouts should use `<KeyboardAvoidingView>` (or `SafeModal`,
 * which wraps it) instead. This hook is for "I need to know the height" cases.
 */
export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({ isVisible: false, height: 0 });

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: KeyboardEvent) => {
      setState({ isVisible: true, height: e.endCoordinates.height });
    };
    const onHide = () => {
      setState({ isVisible: false, height: 0 });
    };

    const showSub = Keyboard.addListener(showEvt, onShow);
    const hideSub = Keyboard.addListener(hideEvt, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return state;
}
