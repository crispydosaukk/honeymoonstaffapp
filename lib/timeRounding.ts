/**
 * Time Rounding Utility
 * 
 * Rules:
 * - Schedule slots are every 30 minutes (e.g., 10:00, 10:30, 11:00, etc.)
 * - If a user clocks in within 0-5 minutes after a slot (e.g., 10:00–10:05), 
 *   the calculated time stays at that slot (10:00).
 * - If a user clocks in 6+ minutes after a slot (e.g., 10:06–10:29),
 *   the calculated time rounds FORWARD to the next slot (10:30).
 * 
 * For clock-out, the same logic applies (rounds forward if > 5 min past slot).
 */

export function getCalculatedTime(timestamp: any): Date | null {
  if (!timestamp) return null;

  let date: Date;
  if (timestamp?.toDate) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = new Date(timestamp.getTime());
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) return null;

  const minutes = date.getMinutes();

  // Find the previous 30-minute slot
  const slotMinutes = minutes < 30 ? 0 : 30;
  const minutesPastSlot = minutes - slotMinutes;

  const result = new Date(date);

  if (minutesPastSlot <= 5) {
    // Within grace period — snap to the slot time
    result.setMinutes(slotMinutes, 0, 0);
  } else {
    // Past grace period — round forward to next 30-min slot
    const nextSlot = slotMinutes + 30;
    if (nextSlot >= 60) {
      result.setHours(result.getHours() + 1, 0, 0, 0);
    } else {
      result.setMinutes(nextSlot, 0, 0);
    }
  }

  return result;
}

export function formatTimeShort(timestamp: any): string {
  if (!timestamp) return "--:--";
  let date: Date;
  if (timestamp?.toDate) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }
  if (isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function calcCalculatedMinutes(clockIn: any, clockOut: any): number {
  const calcIn = getCalculatedTime(clockIn);
  const calcOut = getCalculatedTime(clockOut);
  if (!calcIn || !calcOut) return 0;
  const diff = Math.floor((calcOut.getTime() - calcIn.getTime()) / 60000);
  return Math.max(0, Math.min(diff, 1440));
}
