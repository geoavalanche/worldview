/*
* NASA Worldview
*
* This code was originally developed at NASA/Goddard Space Flight Center for
* the Earth Science Data and Information System (ESDIS) project.
*
* Copyright (C) 2013 - 2014 United States Government as represented by the
* Administrator of the National Aeronautics and Space Administration.
* All Rights Reserved.
*
* Licensed under the NASA Open Source Agreement, Version 1.3
* http://opensource.gsfc.nasa.gov/nosa.php
*/

// DEMO Code only

var wv = wv || {};
wv.swath = wv.swath || function(models, config, ui) {

    var self = {};

    var root = "#wv-data";
    var proj = null;
    var map = null;
    var selected = null;
    var cache = {};
    var layers = [];
    var list;
    var $items;

    var defs = {
        antarctic: {
            layer: "MODIS_Aqua_CorrectedReflectance_TrueColor_Granule_v6",
            endpoint: "http://cache2-sit.gibs.earthdata.nasa.gov/wmts-epsg3031/wmts.cgi?",
            matrixSetName: "250m",
            source: "GIBS:antarctic",
            matrixSet: "EPSG3031_250m",
            swaths: [{
                label: "09:10 - 09:25 UTC",
                granules: [
                    "2014-12-08T09:10:00Z",
                    "2014-12-08T09:15:00Z",
                    "2014-12-08T09:20:00Z",
                    "2014-12-08T09:25:00Z"
                ]
            },{
                label: "10:50 - 11:05 UTC",
                granules: [
                    "2014-12-08T10:50:00Z",
                    "2014-12-08T10:55:00Z",
                    "2014-12-08T11:00:00Z",
                    "2014-12-08T11:05:00Z"
                ]
            }]
        },
        geographic: {
            layer: "MODIS_Terra_Chlorophyll_A_Granule_v5_NRT",
            endpoint: "https://sit.gibs.earthdata.nasa.gov/wmts-epsg4326/wmts.cgi?",
            matrixSetName: "1km",
            source: "GIBS:geographic",
            matrixSet: "EPSG4326_1km",
            swaths: [{
                label: "12:00 - 12:40 UTC",
                granules: [
                    "2014-11-16T12:00:00Z",
                    "2014-11-16T12:05:00Z",
                    "2014-11-16T12:10:00Z",
                    "2014-11-16T12:15:00Z",
                    "2014-11-16T12:20:00Z",
                    "2014-11-16T12:25:00Z",
                    "2014-11-16T12:30:00Z",
                    "2014-11-16T12:35:00Z",
                    "2014-11-16T12:40:00Z"
                ]
            },{
                label: "13:40 - 14:20 UTC",
                granules: [
                    "2014-11-16T13:40:00Z",
                    "2014-11-16T13:45:00Z",
                    "2014-11-16T13:50:00Z",
                    "2014-11-16T13:55:00Z",
                    "2014-11-16T14:00:00Z",
                    "2014-11-16T14:05:00Z",
                    "2014-11-16T14:10:00Z",
                    "2014-11-16T14:15:00Z",
                    "2014-11-16T14:20:00Z"
                ]
            }]
        }
    };

    var init = function() {
        ui.sidebar.events.on("select", onTabChange);

        var $pane = $("<div></div>")
            .attr("id", "swath-list")
            .addClass("content");
        $items = $("<ul></ul>")
            .addClass("category")
            .addClass("selectorboxcategory")
            .addClass("scroll-pane")
            .jScrollPane({
                verticalGutter: 0,
                contentWidth: 238
            });
        $pane.append($items);
        list = $items.data("jsp");
        $(root).append($pane);
    };

    var activate = function() {
        models.proj.events.on("select", onProjectionChange);
        onProjectionChange();
    };

    var deactivate = function() {
        models.proj.events.off("select", onProjectionChange);
    };

    var clear = function() {
        if ( !map ) {
            return;
        }
        _.each(layers, function(layer) {
            map.removeLayer(layer);
        });
        layers = [];
    };

    var updateSelection = function() {
        if ( !selected ) {
            return;
        }
        clear();
        _.each(selected.granules, function(time) {
            var layer = cache[time];
            if ( !layer ) {
                layer = createLayer(time);
                cache[time] = layer;
            }
            map.addLayer(layer);
            layers.push(layer);
        });
    };

    var createLayer = function(time) {
        var def = defs[proj];
        var url = createURL(def, time);
        var source = config.sources[def.source];
        var matrixSet = source.matrixSets[def.matrixSet];

        var layer = new OpenLayers.Layer.XYZ(time, url, {
            "maxResolution": matrixSet.maxResolution,
            "serverResolutions": matrixSet.resolutions,
            "tileSize": new OpenLayers.Size(512, 512)
        });
        return layer;
    };

    var createURL = function(def, time) {
        var params = [
            "TIME=" + time,
            "SERVICE=WMTS",
            "REQUEST=GetTile",
            "VERSION=1.0.0",
            "LAYER=" + def.layer,
            "STYLE=",
            "TILEMATRIXSET=" + def.matrixSetName,
            "TILEMATRIX=${z}",
            "TILEROW=${y}",
            "TILECOL=${x}",
            "FORMAT=image%2Fpng"
        ];
        return def.endpoint + params.join("&");
    };

    var onTabChange = function(tab) {
        if ( tab === "download" ) {
            activate();
        } else {
            deactivate();
        }
    };

    var onProjectionChange = function() {
        proj = models.proj.selected.id;
        map = ui.map.selected;
        if ( defs[proj] ) {
            selected = defs[proj].swaths[0];
        }
        updateList();
        updateSelection();
    };

    var updateList = function() {
        $items.empty();
        var swaths = defs[proj].swaths;
        _.each(swaths, function(swath) {
            renderListItem($items, swath);
        });
        $items.iCheck({
            radioClass: "iradio_square-grey"
        });
        list.reinitialise();

        $items.find("input").on("ifChecked", function() {
            swaths = defs[proj].swaths;
            label = $(this).val();
            selected = _.find(swaths, { label: label });
            updateSelection();
        });
    };

    var renderListItem = function(parent, swath) {
        var $label = $("<label></label>")
            .attr("data-swath", swath.label);
        var $item = $("<li></li>")
            .addClass("wv-swath-list-item")
            .attr("data-swath", swath.label)
            .addClass("item");
        var $name = $("<h4></h4>")
            .addClass("title")
            .html(swath.label);

        var $checkbox = $("<input></input>")
            .attr("value", swath.label)
            .attr("type", "radio")
            .attr("name", "wv-swath-list")
            .addClass("wv-swath-list-check");

        if ( swath === selected ) {
            $checkbox.attr("checked", "checked");
        }

        $item.append($name);
        $item.append($checkbox);
        $label.append($item);
        parent.append($label);
    };

    init();
    return self;

};
