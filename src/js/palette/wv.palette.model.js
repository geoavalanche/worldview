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

/**
 * @module wv.palette
 */
var wv = wv || {};
wv.palette = wv.palette || {};

/**
 * @class wv.palette.model
 */
wv.palette.model = wv.palette.model || function() {

    var self = {};
    self.events = wv.util.events();

    return self;

};