import { translate } from '@/i18n';

/**
 * The texts of the MapLibre controls in the current language. Pass the result
 * as the `locale` option of a new map. MapLibre reads it once, at construction.
 */
export function mapLibreLocale(): Record<string, string> {
	return {
		'AttributionControl.ToggleAttribution': translate('map.control.toggleAttribution'),
		'AttributionControl.MapFeedback': translate('map.control.mapFeedback'),
		'Map.Title': translate('map.control.mapTitle'),
		'NavigationControl.ResetBearing': translate('map.control.resetBearing'),
		'NavigationControl.ZoomIn': translate('map.control.zoomIn'),
		'NavigationControl.ZoomOut': translate('map.control.zoomOut'),
		'Popup.Close': translate('map.control.closePopup')
	};
}
