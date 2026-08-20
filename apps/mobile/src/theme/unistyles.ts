import { UnistylesRegistry } from 'react-native-unistyles';
import { lightTheme } from './light';
import { darkTheme } from './dark';

type AppThemes = {
  light: typeof lightTheme;
  dark: typeof darkTheme;
};

declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
}

UnistylesRegistry
  .addThemes({
    light: lightTheme,
    dark: darkTheme,
  })
  .addConfig({
    adaptiveThemes: true,
    initialTheme: 'dark',
  });
