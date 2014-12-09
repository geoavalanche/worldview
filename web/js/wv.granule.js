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
wv.granule = wv.granule || function(models, config, ui) {

    var endPoint = ""
    var maxDistance = 180;
    var dataFile = "data/Terra.EPSG4326.2014_11_16.json";
    var footprintStyle = {
        strokeColor: "#ffff00",
        strokeOpacity: 1,
        fillOpacity: 0,
        strokeWidth: 1.5
    };

    var self = {};
    var enabled = false;
    var map = null;
    var footprints = null;
    var matches = [];
    var selected = null;
    var image = null;

    self.granules = [];

    self.enable = function() {
        map = ui.map.selected;
        $(map.div).click(onMapClick);

        footprints = new OpenLayers.Layer.Vector("Granule_Footprints", {
            styleMap: new OpenLayers.StyleMap(footprintStyle)
        });
        map.addLayer(footprints);

        self.enabled = true;
    };

    self.disable = function() {
        map = null;
        $(map.div).off("click", onMapClick);
        map.removeLayer(footprints);
        self.enabled = false;
    };

    var updateFootprints = function() {
        footprints.removeAllFeatures();
        var features = [];
        _.each(matches, function(granule) {
            var feature = new OpenLayers.Feature.Vector(granule);
            features.push(feature);
        });
        footprints.addFeatures(features);
    };

    var updateSelection = function() {
        if ( image ) {
            map.removeLayer(image);
            image = null;
        }
        if ( !selected ) {
            return;
        }
        var url = createURL(selected);
        image = new OpenLayers.Layer.XYZ("Granule_Image", url, {
            "maxResolution": 0.5625,
            "serverResolutions": [
                0.5625,
                0.28125,
                0.140625,
                0.0703125,
                0.03515625,
                0.017578125,
                0.0087890625
            ],
            "tileSize": new OpenLayers.Size(512, 512)
        });
        console.log(url);
        map.addLayer(image);
    };

    var createURL = function(granule) {
        var endpoint = "https://sit.gibs.earthdata.nasa.gov/wmts-epsg4326/wmts.cgi?";
        var params = [
            "TIME=" + reformatTime(granule.result.time_start),
            "SERVICE=WMTS",
            "REQUEST=GetTile",
            "VERSION=1.0.0",
            "LAYER=MODIS_Terra_Chlorophyll_A_Granule_v5_NRT",
            "STYLE=",
            "TILEMATRIXSET=1km",
            "TILEMATRIX=${z}",
            "TILEROW=${y}",
            "TILECOL=${x}",
            "FORMAT=image%2Fpng"
        ]
        return endpoint + params.join("&");
    };

    var reformatTime = function(time) {
        var parts = time.split(".");
        return parts[0] + "Z";
    };

    var onMapClick = function(event) {
        event.stopPropagation();
        var ll = map.getLonLatFromPixel({
            x: event.clientX,
            y: event.clientY
        });
        var point = new OpenLayers.Geometry.Point(ll.lon, ll.lat);
        matches = [];
        _.each(self.granules, function(granule) {
            if ( granule.intersects(point) ) {
                matches.push(granule);
            }
        });
        updateFootprints();
        if ( matches.length > 0 ) {
            selected = matches[0];
        } else {
            selected = null;
        }
        updateSelection();
    };

    var onLoad = function(data) {
        _.each(data.feed.entry, function(result) {
            var poly = wv.data.echo.geometry(result).toOpenLayers();
            poly.result = result;
            if ( wv.map.isPolygonValid(poly, maxDistance) ) {
                self.granules.push(poly);
            }
        });
    };

    var init = function() {
        $.getJSON(dataFile, onLoad);
    };

    init();
    return self;

};
