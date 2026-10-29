import { defaultSettings } from '../shared/settings';

/** Popup-wide state. Components mutate `settings` directly; App syncs it out. */
export const ui = $state({
	settings: defaultSettings(),
	/** Index of the EQ band being edited */
	selectedBand: 3
});
