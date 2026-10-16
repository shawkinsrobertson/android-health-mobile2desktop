import type { Preview } from '@storybook/nextjs-vite'
import '../app/globals.css'
import { mswLoader } from 'msw-storybook-addon/csf3'
import { mswHandlers } from './msw-handlers'

// No global React Context providers exist at this app's root (app/layout.tsx
// wraps children in plain html/body + NavBar -- no SessionProvider/
// ThemeProvider anywhere) and no component relies on a particular
// localStorage key to render sensibly, so there's nothing to seed here
// beyond the real CSS and the MSW network layer.
const preview: Preview = {
  parameters: {
    // This app is App Router only (app/**, no pages/) -- without this,
    // @storybook/nextjs-vite mocks the Pages Router context instead, and
    // any component calling next/navigation's useRouter() (App Router)
    // throws "invariant expected app router to be mounted".
    nextjs: {
      appDirectory: true,
    },
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },
  loaders: [mswLoader()],
  async beforeEach({ msw }) {
    msw.use(...mswHandlers);
  },
};

export default preview;