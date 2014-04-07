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
wv.data = wv.data || {};

wv.data.ui = wv.data.ui || function(models, ui, config) {

    var HTML_WIDGET_INACTIVE = "<img src='images/camera.png'></img>";
    var HTML_WIDGET_ACTIVE = "<img src='images/cameraon.png'></img>";

    var queryActive = false;
    var list = null;
    var model = models.data;
    var mapController = null;
    var selectionListPanel = null;
    var downloadListPanel = null;
    var lastResults = null;
    var maps = ui.map;

    var self = {};
    self.selector = "#DataDownload";
    self.id = "DataDownload";

    var init = function() {
        model.events
            .on("activate", onActivate)
            .on("deactivate", onDeactivate)
            .on("productSelect", onProductSelect)
            .on("layerUpdate", onLayerUpdate)
            .on("query", onQuery)
            .on("queryResults", onQueryResults)
            .on("queryCancel", onQueryCancel)
            .on("queryError", onQueryError)
            .on("queryTimeout", onQueryTimeout)
            .on("granuleSelect", updateSelection)
            .on("granuleUnselect", updateSelection);
        $(window).resize(resize);
    };

    self.render = function() {
        var $container = $(self.selector).empty()
            .addClass(self.id + "list")
            .addClass("bank");
        var $actionButton = $("<input></input>")
            .attr("id", "DataDownload_Button")
            .addClass("action")
            .attr("type", "button")
            .attr("value", "")
            .on("click", showDownloadList);

        $container.append($actionButton);

        var $list = $("<div></div>")
            .attr("id", self.id + "content")
            .addClass("content");
        $container.append($list);

        self.refresh();
    };

    self.refresh = function() {
        var $content = $(self.selector + "content");
        var api = $content.data("jsp");
        if ( api ) {
            api.destroy();
        }
        $content = $(self.selector + "content").empty();
        var data = model.groupByProducts();
        $.each(data, function(key, value) {
            refreshProduct($content, key, value);
        });

        $('.dl-group[value="__NO_PRODUCT"] h3 span').click(function(e){
            showUnavailableReason();
        });
        resize();
    };

    var refreshProduct = function($content, key, value) {
        var title = value.title;
        var $header = $("<h3></h3>")
            .addClass("head")
            .html(title);

        // FIXME: Why is this needed?
        var $productSelector;
        if ( !value.notSelectable ) {
            var $selectedCount = $("<i></i>")
                .attr("id", key + "dynamictext")
                .addClass("dynamic")
                .html("0 selected");
            $productSelector = $("<input type='radio'></input>")
                .attr("value", key)
                .attr("data-product", key);

            $header.prepend($productSelector).append($selectedCount);
        }
        if ( model.selectedProduct === key ) {
            $productSelector.each(function() {
                this.checked = true;
            });
        }
        var $contentDlGroup = $("<div class='dl-group'></div>")
            .attr("value", key)
            .attr("data-product", key)
            .click(function() {
                model.selectProduct($(this).find("input").attr("data-product"));
                $(".dl-group").removeClass("dl-group-selected");
                $(this).addClass('dl-group-selected');
                $(".dl-group input").each(function(){
                    this.checked = false;
                });
                $(this).find("input").each(function(){
                    this.checked = true;
                });
            })
            .append($header);

        $content.append($contentDlGroup);

        var $products = $("<ul></ul>")
            .attr("id", self.id + key)
            .addClass(self.id + "category");

        $.each(value.items, function(index, item) {
            refreshLayers($products, key, value, item);
        });
        $contentDlGroup.append($products);
    };

    var refreshLayers = function($container, key, value, layer) {
        var $item = $("<li></li>")
            .attr("id", self.id + key + encodeURIComponent(layer.value))
            .addClass("item")
            .addClass("item-static");
        $item.append("<h4>" + layer.label + "</h4>");
        $item.append("<p>" + layer.sublabel + "</p>");
        $container.append($item);
    };

   var resize = function() {
        var tabs_height = $(".ui-tabs-nav").outerHeight(true);
        var button_height = $(self.selector + "_Button").outerHeight(true);
        $(self.selector).height(
            $(self.selector).parent().outerHeight() - tabs_height - button_height
        );

        var $pane = $(self.selector + "content");
        var api = $pane.data("jsp");
        if ( !wv.util.browser.small ) {
            if ( api ) {
                api.reinitialise();
            } else {
                $pane.jScrollPane({verticalGutter:0, contentWidth:238, autoReinitialise:false});
            }
        } else {
            if ( api ) {
                api.destroy();
            }
        }
   };

    self.onViewChange = function(map) {
        return;
        if ( !model.active || queryActive || !lastResults ) {
            return;
        }
        if ( lastResults.granules.length === 0 ) {
            return;
        }
        var hasCentroids = false;
        var inView = false;
        var extent = map.getExtent().toGeometry();
        $.each(lastResults.granules, function(index, granule) {
            if ( granule.centroid && granule.centroid[map.projection] ) {
                hasCentroids = true;
                if ( extent.intersects(granule.centroid[map.projection]) ) {
                    inView = true;
                    return true;
                }
            }
        });
        if ( hasCentroids && !inView ) {
            wv.ui.indicator.show("Zoom out or move map");
        } else {
            wv.ui.indicator.hide();
        }
    };

    var toggleMode = function() {
        model.toggleMode();
    };

    var onActivate = function() {
        if ( !mapController ) {
            mapController = wv.data.map(model, maps, config);
        }
        onLayerUpdate();
        updateSelection();
    };

    var onDeactivate = function() {
        wv.ui.indicator.hide();
        if ( selectionListPanel ) {
            selectionListPanel.hide();
        }
        if ( downloadListPanel ) {
            downloadListPanel.hide();
        }
    };

    var onProductSelect = function(product) {
        $(self.selector + " input[value='" + product + "']")
            .prop("checked", "true");
    };

    var onLayerUpdate = function() {
        if ( !model.active ) {
            return;
        }
        self.refresh();
    };

    var onQuery = function() {
        queryActive = true;
        wv.ui.indicator.searching();
        if ( selectionListPanel ) {
            selectionListPanel.hide();
        }
        if ( downloadListPanel ) {
            downloadListPanel.hide();
        }
    };

    var onQueryResults = function(results) {
        queryActive = false;
        lastResults = results;
        wv.ui.indicator.hide();
        if ( model.selectedProduct !== null && results.granules.length === 0 ) {
            wv.ui.indicator.noData();
        } else {
            if ( results.meta.showList ) {
                selectionListPanel =
                        wv.data.ui.selectionListPanel(model, results);
                selectionListPanel.show();
            } else {
                if ( selectionListPanel ) {
                    selectionListPanel.hide();
                }
                selectionListPanel = null;
            }
        }
    };

    var onQueryCancel = function() {
        queryActive = false;
        wv.ui.indicator.hide();
    };

    var onQueryError = function(status, error) {
        queryActive = false;
        wv.ui.indicator.hide();
        if ( status !== "abort" ) {
            console.error("Unable to search", status, error);
            wv.ui.notify("Unable to search at this time. Please try " +
                    "again later");
        }
    };

    var onQueryTimeout = function() {
        queryActive = false;
        wv.ui.indicator.hide();
        wv.ui.notify(
            "No results received yet. This may be due to a " +
            "connectivity issue. Please try again later."
        );
    };

    var updateSelection = function() {
        $button = $("#DataDownload_Button");
        var selected = _.size(model.selectedGranules);
        if ( selected > 0 ) {
            $button.removeAttr("disabled");
            var totalSize = model.getSelectionSize();
            if ( totalSize ) {
                var formattedSize = Math.round(totalSize * 100) / 100;
                $button.val("Download Data (" + formattedSize + " MB)");
            } else {
                $button.val("Download Selected Data");
            }
        } else {
            $button.attr("disabled", "disabled").val("No Data Selected");
        }

        var counts = model.getSelectionCounts();
        $.each(counts, function(productId, count) {
            $("#" + productId + "dynamictext").html("" + count + " selected");
        });
        if ( downloadListPanel && downloadListPanel.visible() ) {
            downloadListPanel.show();
        }

    };

    var showDownloadList = function() {
        if ( selectionListPanel ) {
            selectionListPanel.setVisible(false);
        }
        if ( !downloadListPanel ) {
            downloadListPanel =
                    wv.data.ui.downloadListPanel(config, model);
            downloadListPanel.events.on("close", function() {
                if ( selectionListPanel ) {
                    selectionListPanel.setVisible(true);
                }
            });
        }
        downloadListPanel.show();
    };

    var updatePreference = function(event, ui) {
        model.setPreference(event.target.value);
    };

    var showUnavailableReason = function() {
        var o;
        bodyMsg = 'Some layers in Worldview do not have corresponding source data products available for download.  These include National Boundaries, Orbit Tracks, Earth at Night, and MODIS Corrected Reflectance products.<br><br>For a downloadable product similar to MODIS Corrected Reflectance, please try the MODIS Land Surface Reflectance layers available in Worldview.  If you would like to generate MODIS Corrected Reflectance imagery yourself, please see the following document: <a href="https://earthdata.nasa.gov/sites/default/files/field/document/MODIS_True_Color.pdf" target="_blank">https://earthdata.nasa.gov/sites/default/files/field/document/MODIS_True_Color.pdf</a><br><br>If you would like to download only an image, please use the "camera" icon in the upper right.';
        o = new YAHOO.widget.Panel("WVerror", {
            width: "600px",
            zIndex: 1020,
            visible: false,
            constraintoviewport: true
        });
        title = "Notice";
        o.setHeader('<b>Why are these layers not available for downloading?</b>');
        o.setBody(bodyMsg);
        o.render(document.body);
        o.show();
        o.center();
        o.hideEvent.subscribe(function(i) {
            setTimeout(function() {o.destroy();}, 25);
        });
    };

    init();
    return self;

};


wv.data.ui.bulkDownloadPage = wv.data.ui.bulkDownloadPage ||
        (function() {

    var ns = {};

    var pages = {
        wget: "pages/wget.html",
        curl: "pages/curl.html"
    };

    ns.show = function(selection, type) {
        var nonce = Date.now();
        var page = window.open(pages[type] + "?v=" + nonce,
                'Worldview_' + nonce);

        var loaded = false;
        page.onload = function() {
            if ( !loaded ) {
                fillPage(page, selection, type);
                loaded = true;
            }
        };
        var checkCount = 0;
        var timer = setInterval(function() {
            checkCount++;
            if ( loaded ) {
                clearInterval(timer);
                return;
            }
            if ( checkCount > 20 ) {
                clearInterval(timer);
                return;
            }
            if ( fillPage(page, selection, type) ) {
                loaded = true;
                clearInterval(timer);
            }
        }, 100);
    };

    var fillPage = function(page, selection, type) {
        var downloadLinks = [];
        var hosts = {};
        var indirectLinks = [];
        $.each(selection, function(index, product) {
            $.each(product.list, function(index2, granule) {
                var netrc = "";
                if ( granule.urs ) {
                    netrc = "--netrc ";
                }
                $.each(granule.links, function(index2, link) {
                    if ( !link.data ) {
                        return;
                    }
                    if ( product.noBulkDownload ) {
                        indirectLinks.push("<li><a href='" + link.href + "'>" +
                            link.href + "</a></li>");
                        return;
                    }
                    if ( type === "curl" ) {
                        downloadLinks.push("curl --remote-name " + netrc +
                                link.href);
                    } else {
                        downloadLinks.push(link.href);
                    }
                    if ( granule.urs ) {
                        // Get the hostname from the URL, the text between
                        // the double slash and the first slash after that
                        var host = /\/\/([^\/]*)\//.exec(link.href);
                        if ( host ) {
                            hosts[host[1]] = true;
                        }
                    }
                });
            });
        });
        var links = page.document.getElementById("links");
        if ( !links ) {
            // Page is not ready
            return false;
        }
        links.innerHTML = "<pre>" + downloadLinks.join("\n") + "</pre>";

        var netrcEntries = [];
        var hostnames = [];
        $.each(hosts, function(host, value) {
            netrcEntries.push("machine " + host + " login URS_USER " +
                "password URS_PASSWORD");
            hostnames.push(host);
        });
        if ( netrcEntries.length > 0 ) {
            page.document.getElementById("netrc").innerHTML =
                "<pre>" + netrcEntries.join("\n") + "</pre>";
            page.document.getElementById("bulk-password-notice")
                .style.display = "block";
            page.document.getElementById("netrc-instructions")
                .style.display = "block";
            var instructions =
                page.document.getElementById("fdm-password-instructions");
            if ( instructions ) {
                instructions.style.display = "block";
            }
            var machineNames =
                page.document.getElementById("fdm-machine-names");
            if ( machineNames ) {
                machineNames.innerHTML = "<pre>" + hostnames.join("\n") +
                    "</pre>";
            }
        }
        if ( indirectLinks.length > 0 ) {
            page.document.getElementById("indirect-instructions")
                .style.display = "block";
            page.document.getElementById("indirect").innerHTML =
                "<ul>" + indirectLinks.join("\n") + "</ul>";
        }
        return true;
    };

    return ns;

})();


wv.data.ui.downloadListPanel = function(config, model) {

    var echo = wv.data.echo;

    var NOTICE =
        "<div id='DataDownload_Notice'>" +
            "<img class='icon' src='images/info-icon-blue.svg'>" +
            "<p class='text'>" +
                "Some items you have selected require an account with the " +
                "EOSDIS User Registration System (URS) to download. " +
                "It is simple and free to sign up! " +
                "<a href='https://urs.eosdis.nasa.gov/users/new' target='urs'>" +
                "Click to register for an account.</a>" +
            "</p>" +
        "</div>";

    var panel = null;
    var selection;
    var self = {};
    var urs = false;

    self.events = wv.util.events();

    self.show = function() {
        $("#DataDownload_DownloadListPanel .remove").off("click", removeGranule);
        $("#DataDownload_DownloadListPanel a.wget").off("click", showWgetPage);
        $("#DataDownload_DownloadListPanel a.curl").off("click", showCurlPage);
        $("#DataDownload_DownloadListPanel tr").off("mouseenter", onHoverOver);
        $("#DataDownload_DownloadListPanel tr").off("mouseleave", onHoverOut);

        selection = reformatSelection();
        var newPanel = false;
        if ( !panel ) {
            newPanel = true;
            panel = new YAHOO.widget.Panel("DataDownload_DownloadListPanel", {
                width: "650px",
                height: "500px",
                zIndex: 1020,
                visible: false,
                constraintoviewport: true
            });
            panel.setHeader("Download Links");
        }
        panel.setBody(bodyText(selection));
        panel.setFooter(bulkDownloadText());

        if ( newPanel ) {
            panel.render(document.body);
            panel.show();
            panel.center();
            panel.hideEvent.subscribe(function() {
                setTimeout(dispose, 25);
            });
        }

        $("#DataDownload_DownloadListPanel a.wget").click(showWgetPage);
        $("#DataDownload_DownloadListPanel a.curl").click(showCurlPage);
        $("#DataDownload_DownloadListPanel .remove").click(removeGranule);
        $("#DataDownload_DownloadListPanel tr").on("mouseenter", onHoverOver);
        $("#DataDownload_DownloadListPanel tr").on("mouseleave", onHoverOut);

        var bulkVisible = isBulkDownloadable() &&
                _.size(model.selectedGranules) !== 0;
        if ( bulkVisible ) {
            $("#DataDownload_DownloadListPanel .ft .bulk")
                    .css("visibility", "visible");
        } else {
            $("#DataDownload_DownloadListPanel .ft .bulk")
                    .css("visibility", "hidden");
        }
    };

    self.hide = function() {
        if ( panel ) {
            panel.hide();
        }
    };

    self.visible = function() {
        return panel !== null;
    };

    var dispose = function() {
        $("#DataDownload_DownloadListPanel .remove").off("click", removeGranule);
        $("#DataDownload_DownloadListPanel a.wget").off("click", showWgetPage);
        $("#DataDownload_DownloadListPanel a.curl").off("click", showCurlPage);
        $("#DataDownload_DownloadListPanel tr").off("mouseenter", onHoverOver);
        $("#DataDownload_DownloadListPanel tr").off("mouseleave", onHoverOut);

        self.events.trigger("close");
        panel.destroy();
        panel = null;
    };

    var reformatSelection = function() {
        var selection = {};

        urs = false;
        $.each(model.selectedGranules, function(key, granule) {
            if ( granule.urs ) {
                urs = true;
            }
            if ( !selection[granule.product] ) {
                productConfig = config.products[granule.product];
                selection[granule.product] = {
                    name: productConfig.name,
                    granules: [granule],
                    counts: {},
                    noBulkDownload: productConfig.noBulkDownload || false,
                };
            } else {
                selection[granule.product].granules.push(granule);
            }

            var product = selection[granule.product];
            var id = granule.product;

            // For each link that looks like metadata, see if that link is
            // repeated in all granules for that product. If so, we want to
            // bump that up to product level instead of at the granule level.
            $.each(granule.links, function(index, link) {
                if ( link.rel !== echo.REL_DATA && link.rel !== echo.REL_BROWSE ) {
                    if ( !product.counts[link.href]  ) {
                        product.counts[link.href] = 1;
                    } else {
                        product.counts[link.href]++;
                    }
                }
            });
        });

        $.each(selection, function(key, product) {
            product.links = [];
            product.list = [];

            // Check the first granule, and populate product level links
            // where the count equals the number of granules
            var granule = product.granules[0];
            $.each(granule.links, function(index, link) {
                var count = product.counts[link.href];
                if ( count % product.granules.length === 0 ) {
                    product.links.push(reformatLink(link));
                }
            });

            $.each(product.granules, function(index, granule) {
                var item = {
                    id: granule.id,
                    label: granule.downloadLabel || granule.label,
                    links: [],
                    urs: granule.urs
                };
                $.each(granule.links, function(index, link) {
                    // Skip this link if now at the product level
                    var count = product.counts[link.href];
                    if ( count % product.granules.length === 0 ) {
                        return;
                    }
                    // Skip browse images per Kevin's request
                    if ( link.rel === echo.REL_BROWSE ) {
                        return;
                    }
                    item.links.push(reformatLink(link));
                });
                product.list.push(item);
            });
            product.list.sort(function(a, b) {
                if ( a.label > b.label ) {
                    return 1;
                }
                if ( a.label < b.label ) {
                    return -1;
                }
                return 0;
            });
        });

        return selection;
    };

    var isBulkDownloadable = function() {
        var result = false;
        $.each(selection, function(index, product) {
            if ( !product.noBulkDownload ) {
                result = true;
            }
        });
        return result;
    };

    var reformatLink = function(link) {
        // For title, take it if found, otherwise, use the basename of the
        // URI
        return {
            href: link.href,
            title: ( link.title ) ? link.title : link.href.split("/").slice(-1),
            data: ( link.rel === echo.REL_DATA )
        };
    };

    var linksText = function(links) {
        var elements = [];
        elements.push("<ul>");
        $.each(links, function(index, link) {
            elements.push(
                "<li><a href='" + link.href + "' target='_blank'>" +
                link.title + "</a></li>");
        });
        elements.push("</ul>");
        return elements.join("\n");
    };

    var granuleText = function(product, granule) {
        var elements;
        if ( product.name !== granule.label ) {
            elements = [
                "<tr data-granule='" + granule.id + "'>",
                    "<td><input type='button' class='remove' " +
                        "data-granule='" + granule.id + "' " +
                        "value='X'></input></td>",
                    "<td><nobr><ul><li>" + granule.label + "</li></ul></nobr></td>",
                    "<td>" + linksText(granule.links) + "</td>",
                "</tr>"
            ];
        } else {
            elements = [
                "<tr data-granule='" + granule.id + "'>",
                    "<td><input type='button' class='remove' " +
                        "data-granule='" + granule.id + "' " +
                        "value='X'></input></td>",
                    "<td colspan='2'>" + linksText(granule.links) + "</td>",
                "</tr>"
            ];
        }
        return elements.join("\n");
    };

    var productText = function(product) {
        var elements = [
            "<h3>" + product.name + "</h3>"
        ];

        elements.push("<h5>Selected Data</h5>");
        elements.push("<table>");

        $.each(product.list, function(index, item) {
            elements.push(granuleText(product, item));
        });
        elements.push("</table>");

        if ( product.links && product.links.length > 0 ) {
            elements.push("<h5>Data Collection Information</h5>");
            elements.push("<div class='product'>");
            elements.push(linksText(product.links));
            elements.push("</div>");
        }

        return elements.join("\n");
    };

    var bodyText = function() {
        if ( _.size(model.selectedGranules) === 0 ) {
            return "<br/><h3>Selection Empty</h3>";
        }
        var elements = [];
        if ( urs ) {
            elements.push(NOTICE);
        }
        $.each(selection, function(key, product) {
            elements.push("\n<br/>\n" + productText(product));
        });

        var text = elements.join("\n<br/>\n") + "<br/>";
        return text;
    };

    var bulkDownloadText = function() {
        var bulk =
            "<div class='bulk'>" +
            "<h4>Bulk Download</h4>" +
            "<ul class='BulkDownload'>" +
            "<li><a class='wget' href='#'>List of Links:</a> " +
                "for wget or download managers that accept a list of " +
                "URLs</li>" +
            "<li><a class='curl' href='#'>List of cURL Commands:</a> " +
                "can be copied and pasted to " +
                "a terminal window to download using cURL.</li>" +
            "</ul>" +
            "</div>";
        return bulk;
    };

    var showWgetPage = function() {
        wv.data.ui.bulkDownloadPage.show(selection, "wget");
    };

    var showCurlPage = function() {
        wv.data.ui.bulkDownloadPage.show(selection, "curl");
    };

    var removeGranule = function() {
        var id = $(this).attr("data-granule");
        model.unselectGranule(model.selectedGranules[id]);
        onHoverOut.apply(this);
    };

    var onHoverOver = function() {
        model.events.trigger("hoverOver",
                model.selectedGranules[$(this).attr("data-granule")]);
    };

    var onHoverOut = function() {
        model.events.trigger("hoverOut",
                model.selectedGranules[$(this).attr("data-granule")]);
    };

    return self;

};


wv.data.ui.selectionListPanel = function(model, results) {

    var panel = null;
    var self = {};
    var granules = {};

    var init = function() {
        model.events.on("granuleUnselect", onGranuleUnselect);
    };

    self.show = function() {
        panel = new YAHOO.widget.Panel("DataDownload_SelectionListPanel", {
            width: "400px",
            height: "400px",
            zIndex: 1020,
            visible: false,
            close: false,
            constraintoviewport: true
        });
        panel.setHeader("Select data");

        panel.setBody(bodyText());
        panel.render(document.body);
        panel.show();
        panel.center();
        panel.hideEvent.subscribe(function() {
            setTimeout(dispose, 25);
        });

        $.each(results.granules, function(index, granule) {
            granules[granule.id] = granule;
        });

        $("#DataDownload_GranuleList input").on("click", toggleSelection);
    };

    self.hide = function() {
        if ( panel ) {
            panel.hide();
        }
    };

    self.visible = function() {
        return panel !== null;
    };

    self.setVisible = function(value) {
        if ( !value ) {
            $("#DataDownload_SelectionListPanel").hide();
        } else {
            $("#DataDownload_SelectionListPanel").show();
        }
    };

    var dispose = function() {
        panel.destroy();
        panel = null;
        $("#DataDownload_GranuleList input").off("click", toggleSelection);
    };

    var resultsText = function() {
        var elements = [];
        $.each(results.granules, function(index, granule) {
            var selected = model.isSelected(granule) ? "checked='true'" : "";
            elements.push(
                "<tr>" +
                "<td>" +
                "<input type='checkbox' value='" + granule.id + "' " +
                selected + ">" +
                "</td>" +
                "<td class='label'>" + granule.label + "</td>" +
                "</tr>"
            );
        });
        var text = elements.join("\n");
        return text;
    };

    var bodyText = function() {
        var elements = [
            "<div id='DataDownload_GranuleList'>",
            "<table>",
            resultsText(),
            "</table>",
            "</div>"
        ];
        var text = elements.join("\n") + "<br/>";
        return text;
    };

    var toggleSelection = function(event, ui) {
        var granule = granules[$(this).attr("value")];
        var selected = $(this).prop("checked");
        if ( selected ) {
            model.selectGranule(granule);
        } else {
            model.unselectGranule(granule);
        }
    };

    var onGranuleUnselect = function(granule) {
        $("#DataDownload_GranuleList input[value='" + granule.id + "']")
                .removeAttr("checked");
    };


    init();
    return self;

};



