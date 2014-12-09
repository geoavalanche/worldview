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

var wv = wv || {};
wv.map = wv.map || {};

wv.map.ui = wv.map.ui || function(models, config) {

    var self = {};

    var id = "map";
    var selector = "#" + id;

    // When the date changes, save the layer so that the tiles remain
    // cached.
    var cache = new Cache(100);
    var stale = [];
    var reaper = null;

    var $proj  = {};

    // One map for each projection
    self.proj = {};

    // The map for the selected projection
    self.selected = null;

    self.events = wv.util.events();

    var init = function() {
        if ( config.parameters.mockMap ) {
            return;
        }
        _.each(config.projections, function(proj) {
            var map = createMap(proj);
            self.proj[proj.id] = map;
        });

        models.proj.events.on("select", updateProjection);
        models.layers.events.on("add", addLayer);
        models.layers.events.on("remove", removeLayer);
        models.layers.events.on("visibility", updateVisibility);
        models.layers.events.on("opacity", updateOpacity);
        models.layers.events.on("update", updateLayers);
        models.date.events.on("select", updateDate);
        models.palettes.events.on("set-custom", updateLookup);
        models.palettes.events.on("clear-custom", updateLookup);
        models.palettes.events.on("range", updateLookup);
        models.palettes.events.on("update", updateLayers);

        updateProjection();
    };

    var updateProjection = function() {
        if ( self.selected ) {
            // Keep track of center point on projection switch
            self.selected.previousCenter = self.selected.getCenter();
            hideMap(self.selected);
        }
        self.selected = self.proj[models.proj.selected.id];
        reloadLayers();

        // If the browser was resized, the inactive map was not notified of
        // the event. Force the update no matter what and reposition the center
        // using the previous value.
        showMap(self.selected);
        self.selected.updateSize();
        self.selected.setCenter(self.selected.previousCenter);

        updateExtent();
    };

    var hideMap = function(map) {
        $(map.div).hide();
    };

    var showMap = function(map) {
        $(map.div).show();
    };

    var addLayer = function(def) {
        updateLayers();
    };

    self.preload = function(date, callback) {
        var loading = 0;

        var loadend = function(layer) {
            if ( layer ) {
                layer.events.unregister(loadend);
            }
            loading -= 1;
            //console.log("loading", loading);
            if ( loading === 0 ) {
                callback();
            }
        };

        var layers = models.layers.get({
            renderable: true,
            dynamic: true
        });
        loading = layers.length;
        //console.log("loading", loading);
        _.each(layers, function(def) {
            var key = layerKey(def, {date: date});
            var layer = cache.getItem(key);
            if ( !layer ) {
                //console.log("preloading", key);
                layer = createLayer(def, {date: date});
                layer.events.register("loadend", layer, function() {
                    loadend(layer);
                });
                layer.setOpacity(0);
                layer.setVisibility(true);
            } else {
                loadend();
            }
        });
    };

    var updateLayer = function(def) {
        var map = self.selected;
        var key = layerKey(def);
        var mapLayer = _.find(map.layers, { key: key });
        if ( !mapLayer ) {
            var renderable = models.layers.isRenderable(def.id);
            if ( renderable ) {
                var layer = cache.getItem(key);
                if ( !layer ) {
                    //console.log("loading", key);
                    layer = createLayer(def);
                }
                self.selected.addLayer(layer);
            }
        } else if ( models.palettes.isActive(def.id) )  {
            var palette = models.palettes.get(def.id);
            if ( palette.lookup != mapLayer.lookupTable ) {
                mapLayer.lookupTable = palette.lookup;
                _.each(mapLayer.grid, function(row) {
                    _.each(row, function(tile) {
                        tile.applyLookup();
                    });
                });
            }
        }
    };

    var updateLayers = function() {
        _.each(models.layers.get(), function(def) {
            updateLayer(def);
        });
        updateMap();
        self.status("update");
    };

    var removeLayer = function(def) {
        var map = self.selected;
        var key = layerKey(def);
        var layer = _.find(map.layers, { key: key });
        if ( layer ) {
            map.removeLayer(layer);
        }
        updateLayers();
    };

    var updateVisibility = function(def, visible) {
        updateLayers();
    };

    var updateOpacity = function(def) {
        updateLayers();
    };

    var updateDate = function() {
        updateLayers();
    };

    var clearLayers = function(map) {
        var activeLayers = map.layers.slice(0);
        _.each(activeLayers, function(mapLayer) {
            if ( mapLayer.wvid ) {
                map.removeLayer(mapLayer);
            }
        });
        cache.clear();
    };

    var reloadLayers = function(map) {
        map = map || self.selected;
        var proj = models.proj.selected;
        clearLayers(map);

        var defs = models.layers.get({reverse: true});
        _.each(defs, function(def) {
            addLayer(def);
        });
        updateLayers();
    };

    var purgeCache = function() {
        self.status("purge");
        var map = self.selected;
        cache.removeWhere(function(key, mapLayer) {
            var def = config.layers[mapLayer.wvid];
            var renderable = models.layers.isRenderable(def.id);
            var usedKey = layerKey(def);
            if ( !renderable || usedKey !== mapLayer.key ) {
                mapLayer.setVisibility(false);
                return true;
            }
            return false;
        });
    };

    var onCacheRemoval = function(key, layer) {
        stale.push(layer);
        scheduleReaper();
    };

    var scheduleReaper = function() {
        // Already scheduled?
        if ( reaper ) {
            return;
        }
        var map = self.selected;
        reaper = _.delay(function() {
            self.status("reap");
            _.each(stale, function(layer) {
                if ( map.getLayerIndex(layer) >= 0 ) {
                    map.removeLayer(layer);
                }
            });
            stale = [];
            reaper = null;
            updateLayers();
        }, 500);
    };

    var updateMap = function() {
        var map = self.selected;
        _.each(self.selected.layers, function(layer) {
            if ( !layer || !layer.wvid ) {
                return;
            }
            var renderable, key;
            var def = _.find(models.layers.active, { id: layer.wvid });
            if ( !def ) {
                renderable = false;
            } else {
                key = layerKey(def);
                renderable = models.layers.isRenderable(def.id);
            }
            if ( layer.key !== key || !renderable ) {
                if ( layer.wvid === "Graticule" ) {
                    layer.setVisibility(0);
                } else {
                    layer.setOpacity(0);
                    layer.removeBackBuffer();
                }
                layer.div.style.zIndex = 0;
            } else {
                layer.setVisibility(true);
                layer.setOpacity(def.opacity);
                var length = models.layers.active.length;
                var index = _.findIndex(models.layers.active, {id: def.id});
                layer.div.style.zIndex = (length - index) + 1;
                adjustTransition(def, layer);
            }
        });
    };

    var adjustTransition = function(def, layer) {
        // If the layer is not completely opaque, the resize transition
        // doesn't work. A back buffer is used during the transition which
        // ends up duplicating the layer during load which causes a
        // flicker. In this case turn the transition off. Also, it appears
        // that OpenLayers has a bug where the back buffer is used on a
        // visibility change even if the resize transition is turned off.
        // Also remove the back buffer function.
        if ( def.opacity > 0 && def.opacity < 1 && layer.transitionEffect ) {
            layer.transitionEffect = null;
            layer.applyBackBuffer = layer.fnDisabledBackBuffer;
        } else if ( !layer.transitionEffect ) {
            var effect = null;
            if ( def.type === "wmts" ) {
                effect = ( def.noTransition ) ? null: "resize";
            } else if ( def.type === "wms" ) {
                effect = ( def.transition ) ? "resize": null;
            }
            layer.transitionEffect = effect;
            layer.applyBackBuffer = layer.fnEnabledBackBuffer;
        }
    };

    var updateLookup = function(layerId) {
        // If the lookup changes, all layers in the cache are now stale
        // since the tiles need to be rerendered. Remove from cache.
        var selectedDate = wv.util.toISOStringDate(models.date.selected);
        var selectedProj = models.proj.selected.id;
        cache.removeWhere(function(key, mapLayer) {
            if ( mapLayer.wvid === layerId &&
                 mapLayer.wvproj === selectedProj &&
                 mapLayer.wvdate !== selectedDate &&
                 mapLayer.lookupTable ) {
                return true;
            }
            return false;
        });
        updateLayers();
    };

    var updateExtent = function() {
        models.map.update(self.selected.getExtent().toArray());
    };

    var createLayer = function(d, options) {
        options = options || {};
        var proj = models.proj.selected;
        var def = _.cloneDeep(d);
        _.merge(def, d.projections[proj.id]);
        var key = layerKey(def, options);
        if ( def.type === "wmts" ) {
            layer = createLayerWMTS(def, options);
        } else if ( def.type === "wms" ) {
            layer = createLayerWMS(def, options);
        } else if ( def.type === "xyz" ) {
            layer = createLayerXYZ(def);
        } else if ( def.type === "graticule" ) {
            layer = new wv.map.graticule("Graticule");
        } else {
            throw new Error("Unknown layer type: " + def.type);
        }
        cache.setItem(key, layer, { callback: onCacheRemoval });
        layer.key = key;
        layer.wvid = def.id;
        layer.wvdate = wv.util.toISOStringDate(options.date || models.date.selected);
        layer.wvproj = proj.id;
        layer.div.setAttribute("data-layer", def.id);
        layer.div.setAttribute("data-key", key);
        // See the notes for adjustTransition for this awkward behavior.
        layer.fnEnabledBackBuffer = layer.applyBackBuffer;
        layer.fnDisabledBackBuffer = function() {};
        layer.transitionEffect = null;
        self.selected.addLayer(layer);

        return layer;
    };

    var createLayerBlank = function(proj) {
        // Put in a bogus layer to act as the base layer to make the
        // map happy for setting up the starting location
        var options = {
            isBaseLayer: true,
            projection: proj.crs,
            maxExtent: proj.maxExtent,
            resolutions: proj.resolutions,
            units: proj.units || "dd",
            numZoomLevels: proj.numZoomLevels
        };
        return new OpenLayers.Layer("Blank", options);
    };

    var createLayerWMTS = function(def, options) {
        var proj = models.proj.selected;
        var source = config.sources[def.source];
        if ( !source ) {
            throw new Error("[" + def.id + "]: Invalid source: " + def.source);
        }
        var matrixSet = source.matrixSets[def.matrixSet];
        if ( !matrixSet ) {
            throw new Error("Matrix set undefined: " + def.matrixSet);
        }
        var param = {
            url: source.url,
            layer: def.layer || def.id,
            style: "",
            format: def.format,
            matrixSet: matrixSet.id,
            maxResolution: matrixSet.maxResolution,
            serverResolutions: matrixSet.resolutions,
            maxExtent: proj.maxExtent,
            tileSize: new OpenLayers.Size(matrixSet.tileSize[0],
                                          matrixSet.tileSize[1])
        };
        if ( models.palettes.isActive(def.id) ) {
            param.tileClass = wv.map.palette.canvasTile;
            param.lookupTable = models.palettes.active[def.id].lookup;
        }

        var layer = new OpenLayers.Layer.WMTS(param);
        if ( def.period === "daily" ) {
            var date = options.date || models.date.selected;
            layer.mergeNewParams({
                "time": wv.util.toISOStringDate(date)
            });
        }
        return layer;
    };

    var createLayerXYZ = function(def) {
        var source = config.sources[def.source];
        var url = source.url + "/" + def.url;
        var mapOptions = {
            tileSize: new OpenLayers.Size(def.tileSize[0],
                                          def.tileSize[1]),
            transitionEffect: "none"
        };
        if ( def.tileOrigin ) {
            mapOptions.tileOrigin = new OpenLayers.LonLat(
                def.tileOrigin[0],
                def.tileOrigin[1]
            );
        }
        var layer = new OpenLayers.Layer.XYZ(def.title, url, mapOptions);
        return layer;
    };

    var createLayerWMS = function(def, options) {
        var proj = models.proj.selected;
        var source = config.sources[def.source];
        var layerParameter = def.layer || def.id;

        var transparent = ( def.format === "image/png" );

        var params = {
            layers: layerParameter,
            format: def.format,
            transparent: transparent
        };
        if ( def.period === "daily" ) {
            var date = options.date || models.date.selected;
            params.time = wv.util.toISOStringDate(date);
        }
        var mapOptions = {
            tileSize: new OpenLayers.Size(512, 512)
        };
        if ( models.palettes.active[def.id] ) {
            mapOptions.tileClass = wv.map.palette.canvasTile;
            mapOptions.lookupTable = models.palettes.active[def.id].lookup;
        }
        var layer = new OpenLayers.Layer.WMS(def.title, source.url,
                params, mapOptions);
        return layer;
    };

    var createMap = function(proj) {
        var target = id + "-" + proj.id;
        var $map = $("<div></div>")
            .attr("id", target)
            .attr("data-projection", proj.id)
            .addClass("map")
            .click(function() {
                $map.focus();
            });
        $proj[proj.id] = $map;
        $(selector).append($map);

        var options = _.extend({}, proj);
        // OpenLayers uses "projection" for the map object. We use "crs"
        // instead
        options.projection = new OpenLayers.Projection(options.crs);

        // Zooming feature is not as fluid as advertised
        options.zoomMethod = null;

        // Don't let OpenLayers fetch the stylesheet -- that is included
        // manually.
        options.theme = null;

        // Let events propagate up
        options.fallThrough = true;

        // Force OL to get the latest tiles without caching
        options.tileManager = null;

        options.extent = options.maxExtent;
        options.allOverlays = true;
        options.fractionalZoom = false;

        var controls = [];

        // Add navigation controls
        controls.push(new OpenLayers.Control.Navigation({
            dragPanOptions: {
                enableKinetic: true
            }
        }));

        // While these aren't controls, per se, they are extra decorations
        controls.push(new OpenLayers.Control.Attribution());
        controls.push(new OpenLayers.Control.ScaleLine({
            displayClass: "olControlScaleLineCustom",
            maxWidth: 175
        }));

        var coordinateControl = new OpenLayers.Control.MousePosition({
            formatOutput: function(mouseXY) {
                var mouseLonLat = mouseXY.transform(proj.crs, "EPSG:4326");
                // FIXME: Change back to projection model after
                // arctic has been backfilled
                var crs = ( models.proj.change ) ? models.proj.change.crs
                        : models.proj.selected.crs;
                return mouseLonLat.lon.toFixed(3) + "&#176;, " +
                       mouseLonLat.lat.toFixed(3) + "&#176; " +
                       crs;
            }
        });
        controls.push(coordinateControl);

        options.controls = controls;
        var map = new OpenLayers.Map(target, options);

        var navControl =
                map.getControlsByClass("OpenLayers.Control.Navigation")[0];
        navControl.handlers.wheel.interval = 100;
        navControl.handlers.wheel.cumulative = false;

        var $zoomOut = $("<button></button>")
            .addClass("wv-map-zoom-out")
            .addClass("wv-map-zoom");
        var $outIcon = $("<i></i>")
            .addClass("fa")
            .addClass("fa-minus")
            .addClass("fa-1x");
        $zoomOut.append($outIcon);
        $map.append($zoomOut);
        $zoomOut.button({
            text: false
        });

        var $zoomIn = $("<button></button>")
            .addClass("wv-map-zoom-in")
            .addClass("wv-map-zoom");
        var $inIcon = $("<i></i>")
            .addClass("fa")
            .addClass("fa-plus")
            .addClass("fa-1x");
        $zoomIn.append($inIcon);
        $map.append($zoomIn);
        $zoomIn.button({
            text: false
        });

        $zoomIn.click(function(event) {
            map.zoomIn();
            event.stopPropagation();
        });

        $zoomOut.click(function() {
            map.zoomOut();
            event.stopPropagation();
        });

        map.addLayer(createLayerBlank(proj));

        if ( models.proj.selected.id === proj.id && models.map.extent ) {
            map.zoomToExtent(models.map.extent, true);
        } else {
            map.setCenter(proj.startCenter, proj.startZoom);
        }

        map.events.register("zoomend", null, function() {
            if ( map.zoom === map.numZoomLevels - 1 ) {
                $zoomIn.button("disable");
                $zoomOut.button("enable");
            } else if ( map.zoom === 0 ) {
                $zoomIn.button("enable");
                $zoomOut.button("disable");
            } else {
                $zoomIn.button("enable");
                $zoomOut.button("enable");
            }
        });
        map.events.register("moveend", null, function() {
            updateExtent();
            self.events.trigger("moveEnd", map);
        });
        map.events.register("movestart", null, purgeCache);
        map.events.register("preaddlayer", null, onAddLayer);
        map.events.register("preremovelayer", null, onRemoveLayer);
        map.events.register("zoomend", null, function() {
            self.events.trigger("zoomEnd", map);
        });
        $map.hide();

        // Keep track of center point on projection switch
        map.previousCenter = map.getCenter();

        return map;
    };

    var layerKey = function(layerDef, options) {
        options = options || {};
        var layerId = layerDef.id;
        var projId = models.proj.selected.id;
        var date;
        if ( options.date ) {
            date = wv.util.toISOStringDate(options.date);
        } else {
            date = wv.util.toISOStringDate(models.date.selected);
        }
        var dateId = ( layerDef.period === "daily" ) ? date : "";
        var isActive = models.palettes.isActive(layerDef.id);
        var typeId = ( isActive ) ? "canvas" : "image";
        return [layerId, projId, dateId, typeId].join(":");
    };


    // Map load events
    var layersLoading = {};

    var onAddLayer = function(event) {
        var layer = event.layer;
        if ( !layer.wvid ) {
            return;
        }

        var onLoadStart = function() {
            if ( _.size(layersLoading) === 0 ) {
                self.selected.events.triggerEvent("maploadstart");
            }
            layersLoading[layer.wvid] = true;
        };

        var onLoadEnd = function() {
            if ( _.size(layersLoading) === 1 && layersLoading[layer.wvid] ) {
                self.selected.events.triggerEvent("maploadend");
            }
            delete layersLoading[layer.wvid];
        };

        layer.events.register("loadstart", layer, onLoadStart);
        layer.events.register("loadend", layer, onLoadEnd);
        //onLoadStart();
    };

    var onRemoveLayer = function(event) {
        if ( event.layer.wvid ) {
            delete layersLoading[event.layer.wvid];
        }
    };

    self.isLoading = function() {
        return _.size(layersLoading) > 0;
    };

    self.status = function(message) {
        /*
        message = message || "status";
        var map = self.selected;
        console.log(message + ":",
            "layers", map.layers.length,
            "cache", cache.size(),
            "stale", stale.length);
        */
    };

    init();
    return self;

};
