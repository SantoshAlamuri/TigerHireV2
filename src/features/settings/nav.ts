/** Settings root (e.g. /company/settings) must only match exactly, not child routes. */
export function isSettingsSectionActive(
  pathname: string,
  sectionHref: string,
  settingsRoot: string,
): boolean {
  if (sectionHref === settingsRoot) {
    return pathname === settingsRoot;
  }
  return pathname === sectionHref || pathname.startsWith(`${sectionHref}/`);
}
