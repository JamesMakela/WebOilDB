define([
    'jquery',
    'underscore',
    'backbone',
    'module',
    'chosen',
    'moment',
    'sweetalert',
    'text!templates/form/oil.html',
    'model/substance',
    'model/oil/distinct',
    'views/base',
    'views/modal/loading',
    'views/form/oil/table',
    'views/form/oil/specific',
    'jqueryui/widgets/slider'
], function($, _, Backbone, module, chosen, moment, swal,
            OilTemplate, SubstanceModel, OilDistinct, BaseView, LoadingModal,
            OilTable, SpecificOil) {
    'use strict';
    var oilLibForm = BaseView.extend({
        className: 'page oil-form',
        name: 'oillib',
        title: 'ADIOS Oil Library',
        size: 'lg',

        events: function() {
            // Overwriting the update listeners so they do not fire for the chosen input box
            var formHash = BaseView.prototype.events;
            delete formHash['change input'];
            delete formHash['keyup input'];

            formHash['input:not(.chosen-search input)'] = 'update';
            formHash['keyup input:not(.chosen-search input)'] = 'update';
            formHash['click .nav-tabs a'] = 'rendered';
            formHash.ready = 'triggerTableResize';
            formHash['show.bs.modal'] = 'scrollToSelect';

            return _.defaults(OilTable.prototype.events, formHash);
        },

        initialize: function(options, elementModel) {
            console.log('>> library.initialize()');
            BaseView.prototype.initialize.call(this, options);
            this.template = _.template(OilTemplate);

            // this.module = module;
            this.oilTable = new OilTable(elementModel);
            this.model = elementModel;
            this.oilCache = localStorage.getItem('oil_cache');
            var oilCacheJson = JSON.parse(this.oilCache);

            if (_.isNull(oilCacheJson) ||
                    moment().unix() - oilCacheJson.ts > 86400) {
                // Initialize and render loading modal following request
                // to view Oil Library collection
                this.loadingGif = new LoadingModal({title: "Loading Oil Database..."});
                this.loadingGif.render();
            }

            // Passed oilTable's events hash to this view's events
            this.oilTable.on('renderTable', this.renderTable, this);

            // Initialized oilDistinct collection so it is available for the
            // view render
            this.oilDistinct = new OilDistinct();

            this.render();
        },

        render: function(options) {
            console.log('>> library.render()');
            this.$el.append(this.template());
            BaseView.prototype.render.call(this);
            $('body').append(this.$el)

            if (this.oilTable.ready && this.oilDistinct.ready) {
                if (!_.isUndefined(this.loadingGif)) {
                    this.loadingGif.hide();
                }
            }
            else if (!this.oilTable.ready) {
                this.oilTable.once('ready', this.render, this);
            }
            else if (!this.oilDistinct.ready) {
                this.oilDistinct.once('ready', this.render, this);
            }
            else {
                this.oilTable.once('ready', this.render, this);
                this.oilDistinct.once('ready', this.render, this);
            }
        },

        rendered: function(e) {
            this.$('.tab-pane').removeClass('active');
            this.$(e.target.hash).addClass('active');
        },

        triggerTableResize: function() {
            var width = this.$('#tableContainer-inner').css('width');
            this.$('.table-header').css('width', width);
        },

        findMinMax: function(arr) {
            var obj = {};
            for (var i = 0; i < arr.length; i++) {
                var quantity = arr[i];
                var min = quantity + '_min';
                var max = quantity + '_max';

                if (!this[min] && !this[max] && (quantity !== 'pour_point' && quantity !== 'viscosity')){
                    this[min] = Math.floor(_.min(this.oilTable.oilLib.models,
                                                 this.modelIterator(quantity),
                                                 this)
                                            .attributes[quantity]);
                    this[max] = Math.ceil(_.max(this.oilTable.oilLib.models,
                                                this.modelIterator(quantity),
                                                this)
                                           .attributes[quantity]);
                }
                else if (quantity === 'viscosity') {
                    var visMin = _.min(this.oilTable.oilLib.models,
                                       this.modelIterator(quantity),
                                       this)
                                  .attributes[quantity] * 100000;
                    var visMax = _.max(this.oilTable.oilLib.models,
                                       this.modelIterator(quantity),
                                       this)
                                  .attributes[quantity] * 100000;

                    this[min] = visMin;
                    this[max] = visMax;
                }
                else {
                    this[min] = Math.floor(_.min(this.oilTable.oilLib.models,
                                                 this.modelIteratorWithKey(quantity, 0),
                                                 this)
                                            .attributes[quantity][0]);
                    this[max] = Math.ceil(_.max(this.oilTable.oilLib.models,
                                                this.modelIteratorWithKey(quantity, 1),
                                                this)
                                           .attributes[quantity][1]);
                }
                obj[quantity] = {'min': this[min], 'max': this[max]};
            }
            return obj;
        },

        modelIterator: function(quantity) {
            return (function(model) {
                return model.attributes[quantity];
            });
        },

        modelIteratorWithKey: function(quantity, key) {
            return (function(model) {
                return model.attributes[quantity][key];
            });
        },

        renderTable: function() {
            console.log('>> renderTable()...');
            this.$('#tableContainer').html(this.oilTable.$el.html());
        },

        populateSelect: function() {
            this.$('.chosen-select').chosen({width: '192.5px',
                                             no_results_text: 'No results match: '});
            var valueObj = this.oilDistinct.at(2).get('values');
            this.$('.chosen-select').append($('<option></option>').attr('value', 'All').text('All'));

            for (var key in valueObj) {
                this.$('.chosen-select')
                    .append($('<optgroup class="category" id="' + key + '"></optgroup>')
                    .attr('value', key)
                    .attr('label', key));
                for (var i = 0; i < valueObj[key].length; i++) {
                    this.$('#' + key).append($('<option class="subcategory"></option>')
                        .attr('value', valueObj[key][i])
                        .text(key + '-' + valueObj[key][i]));
                }
            }

            this.$('.chosen-select').trigger('chosen:updated');
        },

        update: function() {
            var search = {
                text: $.trim(this.$('#search').val()),
                category: {'parent': this.$('select.chosen-select option:selected').parent().attr('label'),
                           'child': this.$('select.chosen-select option:selected').val()},
                api: this.$('.slider-api').slider('values'),
                viscosity: this.$('.slider-viscosity').slider('values'),
                pour_point: this.$('.slider-pourpoint').slider('values')
            };

            if (!search.text &&
                    search.category.child === 'All' &&
                    search.api === [this.api_min, this.api_max]) {
                this.oilTable.oilLib.models = this.oilTable.oilLib.originalModels;
                this.oilTable.oilLib.length = this.oilTable.oilLib.models.length;
            }
            else if (search.text.indexOf("number") > -1 ||
                     search.text.indexOf("no.") > -1 ||
                     search.text.indexOf("#") > -1) {
                search.text = search.text.replace(/^.*(number|#).*$/, "no.");
                this.oilTable.oilLib.search(search);
            }
            else {
                this.oilTable.oilLib.search(search);
            }

            this.oilTable.render();
            this.triggerTableResize();

            this.$('.resultsLength').empty();
            this.$('.resultsLength').text('Number of results: ' + this.oilTable.oilLib.length);
        },

        headerClick: function(e) {
            this.oilTable.headerClick(e);
            this.triggerTableResize();
        },

        oilSelect: function(e) {
            e.preventDefault();
            this.$('tr').removeClass('select');
            this.$(e.currentTarget).parents('tr').addClass('select');
        },

        scrollToSelect: function() {
            if (this.$('.select').length > 0) {
                setTimeout(_.bind(function() {
                    var offset = this.$('.select').offset();
                    this.$el.animate({scrollTop: offset.top - 200});
                }, this), 25);
            }
        },

        viewSpecificOil: function(e) {
            this.oilId = $(e.currentTarget).parents('tr').data('id');

            if (this.oilId) {
                this.$('.oilQueryContainer').hide();
                this.oilTable.oilLib.fetchOil(this.oilId, _.bind(function(model) {
                   this.specificOil = new SpecificOil({model: model});
                }, this));
            }

            this.$('.backOil').show();
            this.$('.cancel').hide();
        },

        save: function() {
            var oilName = this.$('.select').data('name');
            var oilId = this.$('.select').data('id');
            var substance = new SubstanceModel({adios_oil_id: oilId,
                                                name: oilName});

            substance.fetch({
                success: _.bind(function(model) {
                    console.log('substance: ', substance);

                    this.model.set('substance', substance);
                    this.model.save(null, {
                        success: _.bind(function() {
                            this.hide();
                            this.trigger('save');
                        }, this),
                        error: _.bind(function() {
                            swal({
                                title: 'Failed to load selected Oil',
                                text: this.model.get('substance').get('name') + ' data quality is poor and will not work properly if applied to the model.',
                                type: 'error',
                                confirmButtonText: 'Ok',
                                closeOnConfirm: true
                            });
                        }, this)
                    });
                }, this)
            });
        },

        createSliders: function(minNum, maxNum, selector) {
            // Converting viscosity from m^2/s to cSt before appending
            // the values to the slider
            if (selector !== '.slider-viscosity') {
                this.$(selector).slider({
                    range: true,
                    min: minNum,
                    max: maxNum,
                    values: [minNum, maxNum],

                    create: _.bind(function() {
                       this.$(selector + ' .ui-slider-handle:first')
                           .html('<div class="tooltip bottom slider-tip"><div class="tooltip-arrow"></div><div class="tooltip-inner min">' +
                                 minNum + '</div></div>');
                       this.$(selector + ' .ui-slider-handle:last')
                           .html('<div class="tooltip bottom slider-tip" style="display: visible;"><div class="tooltip-arrow"></div><div class="tooltip-inner max">' +
                                 maxNum + '</div></div>');
                    }, this),

                    slide: _.bind(function(e, ui) {
                       this.$(selector + ' .ui-slider-handle:first')
                           .html('<div class="tooltip bottom slider-tip"><div class="tooltip-arrow"></div><div class="tooltip-inner min">' +
                                 ui.values[0] + '</div></div>');
                       this.$(selector + ' .ui-slider-handle:last')
                           .html('<div class="tooltip bottom slider-tip"><div class="tooltip-arrow"></div><div class="tooltip-inner max">' +
                                 ui.values[1] + '</div></div>');

                       this.updateTooltipWidth();
                    }, this),

                    stop: _.bind(function() {
                        this.update();
                    }, this)
                });
            }
            else {
                // Overriding the original slide callback to follow log scale
                // for the viscosity slider
                this.$(selector).slider({
                    range: true,
                    min: 0,
                    max: 5,
                    values: [0, 5],

                    create: _.bind(function(e, ui) {
                           this.$(selector + ' .ui-slider-handle:first').html('<div class="tooltip bottom slider-tip"><div class="tooltip-arrow"></div><div class="tooltip-inner min">' +
                                                             Math.pow(10, 0) + '</div></div>');
                           this.$(selector + ' .ui-slider-handle:last').html('<div class="tooltip bottom slider-tip" style="display: visible;"><div class="tooltip-arrow"></div><div class="tooltip-inner max">' +
                                                             Math.pow(10, 5) + '</div></div>');
                    }, this),

                    slide: _.bind(function(e, ui) {
                            this.$(selector + ' .ui-slider-handle:first')
                                .html('<div class="tooltip bottom slider-tip"><div class="tooltip-arrow"></div><div class="tooltip-inner min">' +
                                      Math.pow(10, ui.values[0]) + '</div></div>');
                            this.$(selector + ' .ui-slider-handle:last')
                                .html('<div class="tooltip bottom slider-tip"><div class="tooltip-arrow"></div><div class="tooltip-inner max">' +
                                      Math.pow(10, ui.values[1]) + '</div></div>');

                            this.updateTooltipWidth();
                    }, this),

                    stop: _.bind(function() {
                        this.update();
                    }, this)
                });
            }
        },

        goBack: function(e) {
            e.preventDefault();

            this.specificOil.close();
            this.$('.backOil').hide();
            this.$('.cancel').show();
            this.$('.oilQueryContainer').show();

            this.scrollToSelect();
        }
    });

    return oilLibForm;
});
