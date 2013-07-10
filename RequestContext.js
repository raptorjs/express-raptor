var renderContext = require('raptor/render-context');
var templating = require('raptor/templating');
var raptor = require('raptor');
var dataProviders = require('raptor/data-providers');
var Context = require('raptor/render-context/Context');


function app_getAttributes() {
    return this.attributes;
}

var RequestContext = define.Class(
    {
        superclass: Context
    },
    function(require, exports, module) {
        
        var oldRenderTemplate = Context.prototype.renderTemplate;

        function RequestContext(request, response) {
            // Use the response object as the output writer
            RequestContext.superclass.constructor.call(this, response);
            var CONTEXT_KEY = RequestContext.CONTEXT_KEY;


            var attributes = this.getAttributes();
            attributes.request = request;
            attributes.response = response;
            attributes.app = request.app;
            request.attributes = response.attributes = attributes;
            request[CONTEXT_KEY] = response[CONTEXT_KEY] = this;

            if (!request.getAttributes) {
                // Patch the request and response prototype with getAttributes
                request.app.request.getAttributes = app_getAttributes;
                request.app.response.getAttributes = app_getAttributes;
            }
        }

        // Copy properties to our new prototype to keep the prototype chain short:
        raptor.extend(RequestContext.prototype, Context.prototype);

        RequestContext.prototype.createDataProviders = function() {

            var contextApp = this.app;
            var requestApp = this.request.app;


            // This method is invoked by the context.dataProviders method to
            // create the initial DataProviders object
            var appDataProviders = require('./index').dataProviders(this.app);

            // Create a new DataProviders object for this context that extends
            // the application data providers
            return dataProviders.create(appDataProviders);
        };

        RequestContext.prototype.requestData = function(name, args) {

            var dataProviders = this.getDataProviders();
            var provider;

            // First see if we can find a data provider with the data
            // providers registered with the context
            if (dataProviders && (provider = dataProviders.getProvider(name))) {
                return dataProviders.requestData(provider, args);
            }
            else {
                // We didn't find a data provider as part of the context
                // data providers so now see if we can find a provider
                // registered with the app that is associated with this request
                var APP_DATA_PROVIDERS_KEY = RequestContext.APP_DATA_PROVIDERS_KEY;
                var requestApp = this.request.app;
                dataProviders = requestApp[APP_DATA_PROVIDERS_KEY];
                if (dataProviders && (provider = dataProviders.getProvider(name))) {
                    return dataProviders.requestData(provider, args);
                }
                else {
                    // We still didn't find a data provider so now see
                    // if maybe there is a different app associated with the
                    // context that we can check. This would only be the case
                    // if a sub-app module was mounted to a route
                    var contextApp = this.app;
                    if (contextApp !== requestApp) {
                        dataProviders = contextApp[APP_DATA_PROVIDERS_KEY];
                        if (dataProviders && (provider = dataProviders.getProvider(name))) {
                            return dataProviders.requestData(provider, args);
                        }
                    }
                }
            }

            throw raptor.createError(new Error('Data provider not found for "' + name + '"'));
        }

        RequestContext.prototype.renderTemplate = function(templateName, data) {
            // The first "renderTemplate" call is special because it is used
            // to render the page and we automatically close the connection
            // when the rendering is complete. We restore the original 
            // "renderTemplate" method after the first call to this
            // renderTemplate function
            this.renderTemplate = oldRenderTemplate;
            var _this = this;

            function onError(e) {
                var wrappedError = raptor.createError(new Error('Call to context.renderTemplate("' + templateName + '", ...) failed: ' + e), e);
                _this.next(wrappedError);
            }

            try
            {
                var promise = templating.renderAsync(templateName, data, this),
                    response = this.response;

                promise
                    .then(
                        function(output) {
                            response.end();
                        },
                        onError);
                return promise; 
            }
            catch(e) {
                onError(e);
            }
        };

        return RequestContext;
    });

Object.defineProperty(RequestContext.prototype, "request", {
    get: function() { return this.getAttributes().request; },
    set: function(request) { this.getAttributes().request = request; }
});

Object.defineProperty(RequestContext.prototype, "response", {
    get: function() {return this.getAttributes().response; },
    set: function(response) { this.getAttributes().response = response; }
});

Object.defineProperty(RequestContext.prototype, "app", {
    get: function() { return this.getAttributes().app; },
    set: function(app) { this.getAttributes().app = app; }
});

Object.defineProperty(RequestContext.prototype, "next", {
    get: function() {return this.getAttributes().next; },
    set: function(next) { this.getAttributes().next = next; }
});

module.exports = RequestContext;