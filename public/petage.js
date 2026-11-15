
/* ═══════════════════════════════════════════════════════════
   Pet Pantry- petage.js  (one pet's age, from one birthday)

   Shared by the app (pets.html) and the landing page, which is
   why it is its own file: the landing page carries no Supabase
   client, no auth and no store, so it cannot pull in app.js
   just to work out how old a cat is.
═══════════════════════════════════════════════════════════ */

/**
 * A pet's age in whole years and months, worked out from its birthday.
 *
 * Years and months only, never days: "6 yr 1 mo", "7 mo" for a kitten under a
 * year, "under 1 mo" for one born this month. Returns null when there is no
 * usable birthday (missing, malformed, or in the future) so callers can leave
 * the age out of the page rather than print something wrong.
 *
 * @param {string} birthday  a date in YYYY-MM-DD form, as the date input gives it
 * @param {Date}   [today]   override for tests; defaults to now
 * @returns {string|null}
 */
function petAgeLabel(birthday, today = new Date()) {
  if (!birthday) return null;

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthday).slice(0, 10));
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);

  // Built from the parts rather than parsed from the string: new Date('2020-10-01')
  // is midnight UTC, which is still September 30th west of Greenwich.
  const born = new Date(year, month - 1, day);
  // Rejects the dates that do not exist (2021-02-30), which roll over silently.
  if (born.getFullYear() !== year || born.getMonth() !== month - 1 || born.getDate() !== day) return null;

  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (born > now) return null;

  let months = (now.getFullYear() - year) * 12 + (now.getMonth() - (month - 1));
  // The day of the month has not come round yet, so this month does not count.
  if (now.getDate() < day) months -= 1;

  if (months < 1) return 'under 1 mo';
  const years = Math.floor(months / 12);
  const rest  = months % 12;
  if (years < 1) return `${rest} mo`;
  return rest ? `${years} yr ${rest} mo` : `${years} yr`;
}
