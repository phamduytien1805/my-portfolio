import { track } from '@vercel/analytics';

// Custom events for Vercel Web Analytics (Analytics → Events in the Vercel dashboard).
// Only counts and short labels are sent: never what visitors type in the chat.
// Custom events need a Vercel plan that includes them; elsewhere this does nothing.

export type AnalyticsEvent =
  | 'active_time' // how long a visit lasted (see EngagementTracker)
  | 'hero_scroll' // left the greeting for the chat section
  | 'chat_opened'
  | 'message_sent'
  | 'limit_reached'
  | 'game_started'
  | 'game_finished';

export function trackEvent(
  name: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>
) {
  try {
    track(name, properties);
  } catch {
    // Analytics must never break the site.
  }
}
