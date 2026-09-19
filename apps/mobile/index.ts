/**
 * Expo entry point registering App as the native root component.
 * Screen composition and session lifecycle live in App.tsx.
 */
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
