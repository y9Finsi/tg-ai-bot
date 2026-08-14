/**
 * RADIANT Actions Runtime Entry Point
 */

import { actionRegistry } from './registry.js';
import { actionRouter } from './router.js';
import { executeAction } from './executor.js';
import { webSearchAction } from './plugins/web_search.js';
import { weatherAction } from './plugins/weather.js';
import { spbPlacesAction } from './plugins/spb_places.js';

// Авторегистрация системных действий ядра
actionRegistry.register(webSearchAction);
actionRegistry.register(weatherAction);
actionRegistry.register(spbPlacesAction);

export {
    actionRegistry,
    actionRouter,
    executeAction,
    webSearchAction,
    weatherAction,
    spbPlacesAction
};
