import {
  registerApplicationAdapter,
  registerBrowserProvider,
} from "./registry.js";
import { DemoApplicationAdapter } from "./adapters/demo.js";
import { FixtureAtsAdapter } from "./adapters/fixture-ats.js";
import { GenericApplicationAdapter } from "./adapters/generic.js";
import { DemoBrowserProvider } from "./providers/demo-browser.js";
import { PlaywrightBrowserProvider } from "./providers/playwright-browser.js";

/** Shared demo browser instance (scriptable pages for tests/demo flows). */
export const demoBrowserProvider = new DemoBrowserProvider();

export function registerBrowserDefaults(): void {
  registerBrowserProvider(demoBrowserProvider);
  registerBrowserProvider(new PlaywrightBrowserProvider());
  registerApplicationAdapter(new DemoApplicationAdapter());
  registerApplicationAdapter(new FixtureAtsAdapter());
  registerApplicationAdapter(new GenericApplicationAdapter());
}
