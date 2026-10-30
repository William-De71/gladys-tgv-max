// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, train texts, widget contents, scene
// summaries, messages of the Configuration screen. Vocabulary of the Gladys
// interface (appareil / Gerät / dispositivo, scène / Szene / escena) and of
// SNCF (MAX JEUNE, MAX SENIOR, place, trajet). The station names stay as the
// dataset writes them, without accents.
// -----------------------------------------------------------------------------

import { stationLabel } from './stations.js';
import { daysBetween } from './time.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];
const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

const TEXTS = {
  // devices
  deviceName: {
    en: 'TGV MAX {route}',
    fr: 'TGV MAX {route}',
    de: 'TGV MAX {route}',
    es: 'TGV MAX {route}',
  },
  deviceNameFiltered: {
    en: 'TGV MAX {route} ({filter})',
    fr: 'TGV MAX {route} ({filter})',
    de: 'TGV MAX {route} ({filter})',
    es: 'TGV MAX {route} ({filter})',
  },
  featureOpenTrains: {
    en: 'Trains with MAX seats',
    fr: 'Trains avec places MAX',
    de: 'Züge mit MAX-Plätzen',
    es: 'Trenes con plazas MAX',
  },
  featureOpenWeek: {
    en: 'Trains with MAX seats within 7 days',
    fr: 'Trains avec places MAX sous 7 jours',
    de: 'Züge mit MAX-Plätzen in 7 Tagen',
    es: 'Trenes con plazas MAX en 7 días',
  },
  featureOpenDays: {
    en: 'Days with MAX seats',
    fr: 'Jours avec places MAX',
    de: 'Tage mit MAX-Plätzen',
    es: 'Días con plazas MAX',
  },
  featureNextTrain: {
    en: 'Next train with MAX seats',
    fr: 'Prochain train avec places MAX',
    de: 'Nächster Zug mit MAX-Plätzen',
    es: 'Próximo tren con plazas MAX',
  },
  noOpenTrain: {
    en: 'None',
    fr: 'Aucun',
    de: 'Keiner',
    es: 'Ninguno',
  },
  // trains and routes
  train: {
    en: 'train {number}',
    fr: 'train {number}',
    de: 'Zug {number}',
    es: 'tren {number}',
  },
  nextDay: {
    en: '(+1 day)',
    fr: '(J+1)',
    de: '(+1 Tag)',
    es: '(+1 día)',
  },
  hoursBetween: {
    en: '{after}–{before}',
    fr: '{after}–{before}',
    de: '{after}–{before}',
    es: '{after}–{before}',
  },
  hoursFrom: {
    en: 'from {after}',
    fr: 'à partir de {after}',
    de: 'ab {after}',
    es: 'desde las {after}',
  },
  hoursBefore: {
    en: 'before {before}',
    fr: 'avant {before}',
    de: 'vor {before}',
    es: 'antes de las {before}',
  },
  today: {
    en: 'today',
    fr: "aujourd'hui",
    de: 'heute',
    es: 'hoy',
  },
  tomorrow: {
    en: 'tomorrow',
    fr: 'demain',
    de: 'morgen',
    es: 'mañana',
  },
  inDays: {
    en: 'in {days} days',
    fr: 'dans {days} jours',
    de: 'in {days} Tagen',
    es: 'en {days} días',
  },
  andMore: {
    en: '… and {count} more',
    fr: '… et {count} de plus',
    de: '… und {count} weitere',
    es: '… y {count} más',
  },
  // the days of a route
  day_all: { en: 'every day', fr: 'tous les jours', de: 'täglich', es: 'todos los días' },
  day_weekdays: {
    en: 'Monday to Friday',
    fr: 'du lundi au vendredi',
    de: 'Montag bis Freitag',
    es: 'de lunes a viernes',
  },
  day_weekend: {
    en: 'weekends',
    fr: 'le week-end',
    de: 'am Wochenende',
    es: 'los fines de semana',
  },
  day_fri_sun: {
    en: 'Friday to Sunday',
    fr: 'du vendredi au dimanche',
    de: 'Freitag bis Sonntag',
    es: 'de viernes a domingo',
  },
  day_mon: { en: 'Mondays', fr: 'le lundi', de: 'montags', es: 'los lunes' },
  day_tue: { en: 'Tuesdays', fr: 'le mardi', de: 'dienstags', es: 'los martes' },
  day_wed: { en: 'Wednesdays', fr: 'le mercredi', de: 'mittwochs', es: 'los miércoles' },
  day_thu: { en: 'Thursdays', fr: 'le jeudi', de: 'donnerstags', es: 'los jueves' },
  day_fri: { en: 'Fridays', fr: 'le vendredi', de: 'freitags', es: 'los viernes' },
  day_sat: { en: 'Saturdays', fr: 'le samedi', de: 'samstags', es: 'los sábados' },
  day_sun: { en: 'Sundays', fr: 'le dimanche', de: 'sonntags', es: 'los domingos' },
  // scene summaries
  newSeatsSummary: {
    en: 'MAX seats opened on {route}: {count} train(s).',
    fr: 'Places MAX ouvertes sur {route} : {count} train(s).',
    de: 'MAX-Plätze frei auf {route}: {count} Zug/Züge.',
    es: 'Plazas MAX abiertas en {route}: {count} tren(es).',
  },
  soldOutSummary: {
    en: 'No MAX seats left on {route}.',
    fr: 'Plus aucune place MAX sur {route}.',
    de: 'Keine MAX-Plätze mehr auf {route}.',
    es: 'Ya no quedan plazas MAX en {route}.',
  },
  searchSummary: {
    en: '{route}, {date}: {count} train(s) with MAX seats.',
    fr: '{route}, {date} : {count} train(s) avec places MAX.',
    de: '{route}, {date}: {count} Zug/Züge mit MAX-Plätzen.',
    es: '{route}, {date}: {count} tren(es) con plazas MAX.',
  },
  searchNone: {
    en: '{route}, {date}: no MAX seats.',
    fr: '{route}, {date} : aucune place MAX.',
    de: '{route}, {date}: keine MAX-Plätze.',
    es: '{route}, {date}: ninguna plaza MAX.',
  },
  routeSummary: {
    en: '{route}: {count} train(s) with MAX seats over {days} day(s).',
    fr: '{route} : {count} train(s) avec places MAX sur {days} jour(s).',
    de: '{route}: {count} Zug/Züge mit MAX-Plätzen an {days} Tag(en).',
    es: '{route}: {count} tren(es) con plazas MAX en {days} día(s).',
  },
  routeNone: {
    en: '{route}: no MAX seats over the next 30 days.',
    fr: '{route} : aucune place MAX sur les 30 prochains jours.',
    de: '{route}: keine MAX-Plätze in den nächsten 30 Tagen.',
    es: '{route}: ninguna plaza MAX en los próximos 30 días.',
  },
  // widgets
  widgetNoRoute: {
    en: 'Choose a followed route in the settings of the widget.',
    fr: 'Choisissez un trajet suivi dans les réglages du widget.',
    de: 'Wählen Sie in den Einstellungen des Widgets eine verfolgte Strecke.',
    es: 'Elija un trayecto seguido en los ajustes del widget.',
  },
  widgetUnknownRoute: {
    en: 'This route is no longer followed: choose another one in the settings of the widget.',
    fr: 'Ce trajet n’est plus suivi : choisissez-en un autre dans les réglages du widget.',
    de: 'Diese Strecke wird nicht mehr verfolgt: Wählen Sie in den Einstellungen des Widgets eine andere.',
    es: 'Este trayecto ya no se sigue: elija otro en los ajustes del widget.',
  },
  widgetNoRoutes: {
    en: 'No route followed yet: add one with "Add a route" in the configuration of the integration.',
    fr: 'Aucun trajet suivi : ajoutez-en un avec « Ajouter un trajet » dans la configuration de l’intégration.',
    de: 'Noch keine Strecke verfolgt: Fügen Sie eine mit „Strecke hinzufügen“ in der Konfiguration der Integration hinzu.',
    es: 'Aún no se sigue ningún trayecto: añada uno con «Añadir un trayecto» en la configuración de la integración.',
  },
  widgetNotRead: {
    en: 'The trains of this route have not been read yet.',
    fr: 'Les trains de ce trajet n’ont pas encore été lus.',
    de: 'Die Züge dieser Strecke wurden noch nicht gelesen.',
    es: 'Los trenes de este trayecto aún no se han leído.',
  },
  widgetNoSeats: {
    en: 'No MAX seats on these days and hours for now.',
    fr: 'Aucune place MAX sur ces jours et ces horaires pour le moment.',
    de: 'Derzeit keine MAX-Plätze an diesen Tagen und zu diesen Zeiten.',
    es: 'Por ahora no hay plazas MAX en estos días y horarios.',
  },
  widgetOpenTrains: { en: 'Trains', fr: 'Trains', de: 'Züge', es: 'Trenes' },
  widgetOpenDays: { en: 'Days', fr: 'Jours', de: 'Tage', es: 'Días' },
  widgetWeek: { en: 'Within 7 days', fr: 'Sous 7 jours', de: 'In 7 Tagen', es: 'En 7 días' },
  widgetSource: {
    en: 'SNCF data of {date} at {time}',
    fr: 'Données SNCF du {date} à {time}',
    de: 'SNCF-Daten vom {date} um {time}',
    es: 'Datos de SNCF del {date} a las {time}',
  },
  widgetNextTrain: {
    en: 'Next train',
    fr: 'Prochain train',
    de: 'Nächster Zug',
    es: 'Próximo tren',
  },
  widgetSoldOut: { en: 'None', fr: 'Aucun', de: 'Keiner', es: 'Ninguno' },
  widgetChartSeries: {
    en: 'Trains with MAX seats',
    fr: 'Trains avec places MAX',
    de: 'Züge mit MAX-Plätzen',
    es: 'Trenes con plazas MAX',
  },
  widgetChartTitle: {
    en: 'Over the next 30 days',
    fr: 'Sur les 30 prochains jours',
    de: 'In den nächsten 30 Tagen',
    es: 'En los próximos 30 días',
  },
  widgetBestDay: {
    en: 'Most seats',
    fr: 'Le plus de places',
    de: 'Die meisten Plätze',
    es: 'Más plazas',
  },
  widgetError: {
    en: 'SNCF open data cannot be read right now: {detail}',
    fr: 'L’open data SNCF est illisible pour le moment : {detail}',
    de: 'SNCF Open Data ist gerade nicht lesbar: {detail}',
    es: 'Los datos abiertos de SNCF no se pueden leer ahora: {detail}',
  },
  // connection status
  statusOk: {
    en: 'SNCF data of {date} at {time} · {routes} route(s) followed',
    fr: 'Données SNCF du {date} à {time} · {routes} trajet(s) suivi(s)',
    de: 'SNCF-Daten vom {date} um {time} · {routes} Strecke(n) verfolgt',
    es: 'Datos de SNCF del {date} a las {time} · {routes} trayecto(s) seguido(s)',
  },
  statusNoRoute: {
    en: 'Connected to SNCF open data. Add a route with "Add a route".',
    fr: 'Connecté à l’open data SNCF. Ajoutez un trajet avec « Ajouter un trajet ».',
    de: 'Mit SNCF Open Data verbunden. Fügen Sie mit „Strecke hinzufügen“ eine Strecke hinzu.',
    es: 'Conectado a los datos abiertos de SNCF. Añada un trayecto con «Añadir un trayecto».',
  },
  errorQuota: {
    en: 'The daily quota of the SNCF portal is used up for this address: back after midnight UTC.',
    fr: 'Le quota quotidien du portail SNCF est épuisé pour cette adresse : retour après minuit UTC.',
    de: 'Das Tageskontingent des SNCF-Portals ist für diese Adresse aufgebraucht: wieder nach Mitternacht UTC.',
    es: 'La cuota diaria del portal de SNCF está agotada para esta dirección: vuelve tras la medianoche UTC.',
  },
  errorUnreachable: {
    en: 'The SNCF open data portal does not answer ({detail}). Retrying every 30 minutes.',
    fr: 'Le portail open data SNCF ne répond pas ({detail}). Nouvel essai toutes les 30 minutes.',
    de: 'Das SNCF-Open-Data-Portal antwortet nicht ({detail}). Neuer Versuch alle 30 Minuten.',
    es: 'El portal de datos abiertos de SNCF no responde ({detail}). Nuevo intento cada 30 minutos.',
  },
  // configuration actions
  testOk: {
    en: 'SNCF open data answers: data of {date} at {time}, {stations} stations, {records} records. Daily quota left: {quota}.',
    fr: 'L’open data SNCF répond : données du {date} à {time}, {stations} gares, {records} lignes. Quota du jour restant : {quota}.',
    de: 'SNCF Open Data antwortet: Daten vom {date} um {time}, {stations} Bahnhöfe, {records} Einträge. Verbleibendes Tageskontingent: {quota}.',
    es: 'Los datos abiertos de SNCF responden: datos del {date} a las {time}, {stations} estaciones, {records} registros. Cuota diaria restante: {quota}.',
  },
  stationsFound: {
    en: 'Stations of MAX matching "{query}":',
    fr: 'Gares MAX correspondant à « {query} » :',
    de: 'MAX-Bahnhöfe passend zu „{query}“:',
    es: 'Estaciones MAX que coinciden con «{query}»:',
  },
  stationsNone: {
    en: 'No station of MAX matches "{query}". Type the start of the city name ("Marseille", "Aix").',
    fr: 'Aucune gare MAX ne correspond à « {query} ». Tapez le début du nom de la ville (« Marseille », « Aix »).',
    de: 'Kein MAX-Bahnhof passt zu „{query}“. Geben Sie den Anfang des Städtenamens ein („Marseille“, „Aix“).',
    es: 'Ninguna estación MAX coincide con «{query}». Escriba el inicio del nombre de la ciudad («Marseille», «Aix»).',
  },
  stationGroup: {
    en: 'every station of the city',
    fr: 'toutes les gares de la ville',
    de: 'alle Bahnhöfe der Stadt',
    es: 'todas las estaciones de la ciudad',
  },
  routeAdded: {
    en: 'Route added: {route}, {filter}. Open the Discovery tab and add its device: the seats appear within a minute.',
    fr: 'Trajet ajouté : {route}, {filter}. Ouvrez l’onglet Découverte et ajoutez son appareil : les places s’affichent dans la minute.',
    de: 'Strecke hinzugefügt: {route}, {filter}. Öffnen Sie den Tab Erkennung und fügen Sie ihr Gerät hinzu: Die Plätze erscheinen innerhalb einer Minute.',
    es: 'Trayecto añadido: {route}, {filter}. Abra la pestaña Descubrimiento y añada su dispositivo: las plazas aparecen en un minuto.',
  },
  routesAdded: {
    en: 'Routes added: {route} and its return, {filter}. Open the Discovery tab and add their devices.',
    fr: 'Trajets ajoutés : {route} et son retour, {filter}. Ouvrez l’onglet Découverte et ajoutez leurs appareils.',
    de: 'Strecken hinzugefügt: {route} und Rückfahrt, {filter}. Öffnen Sie den Tab Erkennung und fügen Sie ihre Geräte hinzu.',
    es: 'Trayectos añadidos: {route} y su vuelta, {filter}. Abra la pestaña Descubrimiento y añada sus dispositivos.',
  },
  routeChanged: {
    en: 'Route changed: {route}, {filter}. The device keeps its name until you rename it.',
    fr: 'Trajet modifié : {route}, {filter}. L’appareil garde son nom tant que vous ne le renommez pas.',
    de: 'Strecke geändert: {route}, {filter}. Das Gerät behält seinen Namen, bis Sie es umbenennen.',
    es: 'Trayecto modificado: {route}, {filter}. El dispositivo conserva su nombre hasta que lo renombre.',
  },
  routeRemoved: {
    en: 'Route removed: {route}. Delete its device in Gladys if you no longer need it.',
    fr: 'Trajet supprimé : {route}. Supprimez son appareil dans Gladys si vous n’en avez plus besoin.',
    de: 'Strecke entfernt: {route}. Löschen Sie ihr Gerät in Gladys, wenn Sie es nicht mehr brauchen.',
    es: 'Trayecto eliminado: {route}. Elimine su dispositivo en Gladys si ya no lo necesita.',
  },
  routesNone: {
    en: 'No route followed yet: add one with "Add a route".',
    fr: 'Aucun trajet suivi : ajoutez-en un avec « Ajouter un trajet ».',
    de: 'Noch keine Strecke verfolgt: Fügen Sie eine mit „Strecke hinzufügen“ hinzu.',
    es: 'Aún no se sigue ningún trayecto: añada uno con «Añadir un trayecto».',
  },
  routesList: {
    en: 'Followed routes ({count}):',
    fr: 'Trajets suivis ({count}) :',
    de: 'Verfolgte Strecken ({count}):',
    es: 'Trayectos seguidos ({count}):',
  },
  routeLine: {
    en: '#{index} {route}, {filter}: {seats}',
    fr: '#{index} {route}, {filter} : {seats}',
    de: '#{index} {route}, {filter}: {seats}',
    es: '#{index} {route}, {filter}: {seats}',
  },
  routeSeats: {
    en: '{count} train(s) with MAX seats',
    fr: '{count} train(s) avec places MAX',
    de: '{count} Zug/Züge mit MAX-Plätzen',
    es: '{count} tren(es) con plazas MAX',
  },
  routeNotRead: {
    en: 'not read yet',
    fr: 'pas encore lu',
    de: 'noch nicht gelesen',
    es: 'aún no leído',
  },
  errorStationEmpty: {
    en: 'Type a departure and an arrival station.',
    fr: 'Tapez une gare de départ et une gare d’arrivée.',
    de: 'Geben Sie einen Abfahrts- und einen Ankunftsbahnhof ein.',
    es: 'Escriba una estación de salida y una de llegada.',
  },
  errorStationNone: {
    en: 'No station of MAX is called "{query}". Try "Find a station".',
    fr: 'Aucune gare MAX ne s’appelle « {query} ». Essayez « Chercher une gare ».',
    de: 'Kein MAX-Bahnhof heißt „{query}“. Versuchen Sie „Bahnhof suchen“.',
    es: 'Ninguna estación MAX se llama «{query}». Pruebe «Buscar una estación».',
  },
  errorStationAmbiguous: {
    en: '"{query}" could be: {candidates}. Type one of them.',
    fr: '« {query} » peut désigner : {candidates}. Tapez l’une d’elles.',
    de: '„{query}“ kann sein: {candidates}. Geben Sie einen davon ein.',
    es: '«{query}» puede ser: {candidates}. Escriba una de ellas.',
  },
  errorSameStation: {
    en: 'The departure and the arrival are the same station.',
    fr: 'Le départ et l’arrivée sont la même gare.',
    de: 'Abfahrt und Ankunft sind derselbe Bahnhof.',
    es: 'La salida y la llegada son la misma estación.',
  },
  errorNoTrains: {
    en: 'No MAX train runs from {origin} to {destination} over the next 30 days: check the stations (MAX covers TGV INOUI and Intercités with reservation).',
    fr: 'Aucun train MAX ne va de {origin} à {destination} sur les 30 prochains jours : vérifiez les gares (MAX couvre les TGV INOUI et les Intercités à réservation).',
    de: 'Kein MAX-Zug fährt in den nächsten 30 Tagen von {origin} nach {destination}: Bahnhöfe prüfen (MAX gilt für TGV INOUI und Intercités mit Reservierung).',
    es: 'Ningún tren MAX va de {origin} a {destination} en los próximos 30 días: compruebe las estaciones (MAX cubre los TGV INOUI y los Intercités con reserva).',
  },
  errorHours: {
    en: 'Hours from 0 to 24, the first before the second (17 and 21: leaving from 17:00 to 21:00).',
    fr: 'Heures de 0 à 24, la première avant la seconde (17 et 21 : départ de 17 h à 21 h).',
    de: 'Stunden von 0 bis 24, die erste vor der zweiten (17 und 21: Abfahrt von 17 bis 21 Uhr).',
    es: 'Horas de 0 a 24, la primera antes de la segunda (17 y 21: salida de 17:00 a 21:00).',
  },
  errorDays: {
    en: 'Unknown days: choose them in the list.',
    fr: 'Jours inconnus : choisissez-les dans la liste.',
    de: 'Unbekannte Tage: Wählen Sie sie in der Liste.',
    es: 'Días desconocidos: elíjalos en la lista.',
  },
  errorDate: {
    en: '"{date}" is not a date: type 2026-11-06, 06/11 or +3.',
    fr: '« {date} » n’est pas une date : tapez 06/11/2026, 06/11 ou +3.',
    de: '„{date}“ ist kein Datum: Geben Sie 06.11.2026, 06/11 oder +3 ein.',
    es: '«{date}» no es una fecha: escriba 06/11/2026, 06/11 o +3.',
  },
  errorDatePast: {
    en: '"{date}" is in the past.',
    fr: '« {date} » est passé.',
    de: '„{date}“ liegt in der Vergangenheit.',
    es: '«{date}» ya pasó.',
  },
  errorTooManyDates: {
    en: '{max} dates at most.',
    fr: '{max} dates au plus.',
    de: 'Höchstens {max} Daten.',
    es: '{max} fechas como máximo.',
  },
  errorTooManyRoutes: {
    en: '{max} routes at most: remove one first.',
    fr: '{max} trajets au plus : supprimez-en un d’abord.',
    de: 'Höchstens {max} Strecken: Entfernen Sie zuerst eine.',
    es: '{max} trayectos como máximo: elimine uno primero.',
  },
  errorRouteExists: {
    en: 'This route is already followed with these days and hours.',
    fr: 'Ce trajet est déjà suivi avec ces jours et ces horaires.',
    de: 'Diese Strecke wird mit diesen Tagen und Zeiten bereits verfolgt.',
    es: 'Este trayecto ya se sigue con estos días y horarios.',
  },
  errorRouteMissing: {
    en: 'Type the number of the route (see "List the routes") or its stations.',
    fr: 'Tapez le numéro du trajet (voir « Lister les trajets ») ou ses gares.',
    de: 'Geben Sie die Nummer der Strecke (siehe „Strecken auflisten“) oder ihre Bahnhöfe ein.',
    es: 'Escriba el número del trayecto (vea «Listar los trayectos») o sus estaciones.',
  },
  errorRouteUnknown: {
    en: 'No followed route matches "{query}": see "List the routes".',
    fr: 'Aucun trajet suivi ne correspond à « {query} » : voir « Lister les trajets ».',
    de: 'Keine verfolgte Strecke passt zu „{query}“: siehe „Strecken auflisten“.',
    es: 'Ningún trayecto seguido coincide con «{query}»: vea «Listar los trayectos».',
  },
  errorRouteAmbiguous: {
    en: 'Several routes match "{query}": type its number (see "List the routes").',
    fr: 'Plusieurs trajets correspondent à « {query} » : tapez son numéro (voir « Lister les trajets »).',
    de: 'Mehrere Strecken passen zu „{query}“: Geben Sie ihre Nummer ein (siehe „Strecken auflisten“).',
    es: 'Varios trayectos coinciden con «{query}»: escriba su número (vea «Listar los trayectos»).',
  },
  errorStored: {
    en: 'Invalid route.',
    fr: 'Trajet invalide.',
    de: 'Ungültige Strecke.',
    es: 'Trayecto no válido.',
  },
  errorSearchDate: {
    en: 'Give a date within the next 30 days: 2026-11-06, 06/11, today, tomorrow or +3.',
    fr: 'Donnez une date dans les 30 prochains jours : 06/11/2026, 06/11, aujourd’hui, demain ou +3.',
    de: 'Geben Sie ein Datum in den nächsten 30 Tagen an: 06.11.2026, 06/11, heute, morgen oder +3.',
    es: 'Indique una fecha en los próximos 30 días: 06/11/2026, 06/11, hoy, mañana o +3.',
  },
};

/**
 * @description Whether a value is one of the languages of the texts.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, with its placeholders filled.
 * @param {string} key - The key of TEXTS.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The placeholders.
 * @returns {string} The text.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - The key of TEXTS.
 * @param {object|Function} [values] - The placeholders, or `(language) =>`
 * placeholders.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description The name of a station of the dataset, as people read it.
 * @param {string} name - "PARIS (intramuros)".
 * @returns {string} "Paris".
 */
const stationName = (name) => stationLabel(name);

/**
 * @description The name of a route.
 * @param {object} route - `{ origin, destination }`.
 * @returns {string} "Paris → Lyon".
 */
const routeName = (route) => `${stationName(route.origin)} → ${stationName(route.destination)}`;

/**
 * @description "17:00".
 * @param {number} hour - 0-24.
 * @returns {string} The time.
 */
const hourText = (hour) => `${String(hour).padStart(2, '0')}:00`;

/**
 * @description A date: "Friday 6 November".
 * @param {string} date - `YYYY-MM-DD`.
 * @param {string} language - The language.
 * @param {object} [options] - `{ short }`: "Fri 6 Nov".
 * @returns {string} The date.
 */
function dateText(date, language, { short = false } = {}) {
  const locale = LOCALES[isLanguage(language) ? language : 'en'];
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: short ? 'short' : 'long',
    day: 'numeric',
    month: short ? 'short' : 'long',
  }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * @description A day and month: "06/11".
 * @param {string} date - `YYYY-MM-DD`.
 * @param {string} language - The language.
 * @returns {string} The date, in numbers.
 */
function numericDate(date, language) {
  const locale = LOCALES[isLanguage(language) ? language : 'en'];
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * @description The days and hours of a route: "Fridays, 17:00–21:00".
 * @param {object} route - `{ days, dates, after, before }`.
 * @param {string} language - The language.
 * @param {object} [options] - `{ always }`: "every day" rather than ''.
 * @returns {string} The filter, '' for every day at any hour (unless `always`).
 */
function routeFilter(route, language, { always = false } = {}) {
  const parts = [];
  if (route.dates?.length) {
    parts.push(route.dates.map((date) => numericDate(date, language)).join(', '));
  } else if (route.days !== 'all' || always) {
    parts.push(t(`day_${route.days}`, language));
  }
  const after = route.after ?? 0;
  const before = route.before ?? 24;
  if (after > 0 && before < 24) {
    parts.push(t('hoursBetween', language, { after: hourText(after), before: hourText(before) }));
  } else if (after > 0) {
    parts.push(t('hoursFrom', language, { after: hourText(after) }));
  } else if (before < 24) {
    parts.push(t('hoursBefore', language, { before: hourText(before) }));
  }
  return parts.join(', ');
}

/**
 * @description "today", "tomorrow", "in 5 days".
 * @param {string} date - `YYYY-MM-DD`.
 * @param {string} today - Today, `YYYY-MM-DD`.
 * @param {string} language - The language.
 * @returns {string} The delay.
 */
function relativeDay(date, today, language) {
  const days = daysBetween(today, date);
  if (days <= 0) {
    return t('today', language);
  }
  if (days === 1) {
    return t('tomorrow', language);
  }
  return t('inDays', language, { days });
}

/**
 * @description A train: "Fri 6 Nov · 06:20 → 08:22 · train 6641".
 * @param {object} train - A train of parseTrains.
 * @param {string} language - The language.
 * @param {object} [options] - `{ today, date }`: `date: false` leaves the
 * date out.
 * @returns {string} The text.
 */
function trainText(train, language, { date = true } = {}) {
  const arrival = train.arrival
    ? ` → ${train.arrival}${train.nextDay ? ` ${t('nextDay', language)}` : ''}`
    : '';
  const parts = [`${train.departure}${arrival}`, t('train', language, { number: train.number })];
  if (date) {
    parts.unshift(dateText(train.date, language, { short: true }));
  }
  return parts.join(' · ');
}

export {
  LANGUAGES,
  LOCALES,
  TEXTS,
  isLanguage,
  t,
  all,
  stationName,
  routeName,
  hourText,
  dateText,
  numericDate,
  routeFilter,
  relativeDay,
  trainText,
};
