/*
 * NASA Worldview
 *
 * This code was originally developed at NASA/Goddard Space Flight Center for
 * the Earth Science Data and Information System (ESDIS) project.
 *
 * Copyright (C) 2013 - 2014 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 */

var config = module.exports;

config["wv"] = {
    rootPath: "./",
    environment: "browser",
    libs: [
        "web/ext/main/lodash-2.4.1/lodash.js",
        "web/ext/main/jquery-1.11.0/jquery.js",
        "web/ext/main/jquery.migrate-1.2.1/jquery-migrate.min.js",
        "web/ext/main/jscache-gitba01cdc/cache.js",
        "web/ext/map/openlayers-2.13.1-wv1/OpenLayers.js",
        "test/fixtures.js"
    ],
    src: [
        "web/js/util/wv.*.js",
        "web/js/wv.*.js",
        "!web/js/wv.main.js",
        "web/js/ui/wv.ui.js",
        "web/js/ui/wv.ui.mouse.js",
        "web/js/ui/wv.ui.indicator.js",
        "web/js/date/wv.*.js",
        "web/js/layers/wv.*.js",
        "web/js/link/wv.*.js",
        "web/js/palettes/wv.*.js",
        "web/js/proj/wv.*.js",
        "web/js/data/wv.*.js",
        "web/js/map/wv.*.js",
        "!web/js/map/wv.map.tileworker.js"
    ],
    tests: [
        "test/**/*.js"
    ]
};
