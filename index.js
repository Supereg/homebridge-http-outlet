"use strict";

let Service, Characteristic, api;

const _http_base = require("homebridge-http-base");
const http = _http_base.http;
const configParser = _http_base.configParser;
const PullTimer = _http_base.PullTimer;
const notifications = _http_base.notifications;
const MQTTClient = _http_base.MQTTClient;
const Cache = _http_base.Cache;

const packageJSON = require("./package.json");

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    api = homebridge;

    homebridge.registerAccessory("homebridge-http-outlet", "HTTP-OUTLET", HTTP_OUTLET);
};

function HTTP_OUTLET(log, config) {
    this.log = log;
    this.name = config.name;
    this.debug = config.debug || false;

    const success = this.parseCharacteristics(config);
    if (!success) {
        this.log.warn("Aborting...");
        return;
    }


    this.statusCache = new Cache(config.statusCache, 0);
    this.outletInUseCache = new Cache(config.outletInUseCache, 0);

    if (config.statusCache && typeof config.statusCache !== "number")
        this.log.warn("Property 'statusCache' was given in an unsupported type. Using default one!");
    if (config.outletInUseCache && typeof config.outletInUseCache !== "number")
        this.log.warn("Property 'outletInUseCache' was given in an unsupported type. Using default one!");


    if (config.auth) {
        if (!(config.auth.username && config.auth.password))
            this.log("'auth.username' and/or 'auth.password' was not set!");
        else {
            const urlObjects = [this.power.onUrl, this.power.offUrl, this.power.statusUrl];
            if (this.outletInUse)
                urlObjects.push(this.outletInUse.statusUrl);

            urlObjects.forEach(value => {
                value.auth.username = config.auth.username;
                value.auth.password = config.auth.password;

                if (typeof config.auth.sendImmediately === "boolean")
                    value.auth.sendImmediately = config.auth.sendImmediately;
            })
        }
    }

    this.homebridgeService = new Service.Outlet(this.name);
    this.homebridgeService.getCharacteristic(Characteristic.On)
        .on("get", this.getPowerState.bind(this))
        .on("set", this.setPowerState.bind(this));
    if (this.outletInUse)
        this.homebridgeService.getCharacteristic(Characteristic.OutletInUse)
            .on("get", this.getOutletInUse.bind(this));

    /** @namespace config.pullInterval */
    if (config.pullInterval) {
        // TODO what is with updating the 'OutletInUse' characteristic. 'On' should be enough for now, since this is probably the characteristic
        //  that matters the most and also get's changed the most.
        this.pullTimer = new PullTimer(this.log, config.pullInterval, this.getPowerState.bind(this), value => {
            this.homebridgeService.getCharacteristic(Characteristic.On).updateValue(value);
        });
        this.pullTimer.start();
    }

    /** @namespace config.notificationID */
    /** @namespace config.notificationPassword */
    if (config.notificationID)
        notifications.enqueueNotificationRegistrationIfDefined(api, log, config.notificationID, config.notificationPassword, this.handleNotification.bind(this));

    /** @namespace config.mqtt */
    if (config.mqtt) {
        let options;
        try {
            options = configParser.parseMQTTOptions(config.mqtt);
        } catch (error) {
            this.log.error("Error occurred while parsing MQTT property: " + error.message);
            this.log.error("MQTT will not be enabled!");
        }

        if (options) {
            try {
                this.mqttClient = new MQTTClient(this.homebridgeService, options, this.log);
                this.mqttClient.connect();
            } catch (error) {
                this.log.error("Error occurred creating MQTT client: " + error.message);
            }
        }
    }

    this.log("Outlet successfully configured...");
    if (this.debug) {
        this.log("Outlet started with the following options: ");
        this.log("  - power: " + JSON.stringify(this.power));
        if (this.outletInUse)
            this.log("  - outletInUse: " + JSON.stringify(this.outletInUse));

        if (this.auth)
            this.log("  - auth options: " + JSON.stringify(this.auth));

        if (this.pullTimer)
            this.log("  - pullTimer started with interval " + config.pullInterval);

        if (config.notificationID)
            this.log("  - notificationID specified: " + config.notificationID);

        if (this.mqttClient) {
            const options = this.mqttClient.mqttOptions;
            this.log(`  - mqtt client instantiated: ${options.protocol}://${options.host}:${options.port}`);
            this.log("     -> subscribing to topics:");

            for (const topic in this.mqttClient.subscriptions) {
                if (!this.mqttClient.subscriptions.hasOwnProperty(topic))
                    continue;

                this.log(`         - ${topic}`);
            }
        }
    }
}

HTTP_OUTLET.prototype = {

    parseCharacteristics: function (config) {
        this.power = {};

        if (!config.onUrl) {
            this.log.warn("Property 'onUrl' is required!");
            return false;
        }
        if (!config.offUrl) {
            this.log.warn("Property 'offUrl' is required!");
            return false;
        }
        if (!config.statusUrl) {
            this.log.warn("Property 'statusUrl' is required");
            return false;
        }

        let url;
        try {
            // noinspection JSUnusedAssignment
            url = "onUrl";
            this.power.onUrl = configParser.parseUrlProperty(config.onUrl);
            // noinspection JSUnusedAssignment
            url = "offUrl";
            this.power.offUrl = configParser.parseUrlProperty(config.offUrl);
            url = "statusUrl";
            this.power.statusUrl = configParser.parseUrlProperty(config.statusUrl);
        } catch (error) {
            this.log.warn(`Error occurred while parsing '${url}': ${error.message}`);
            return false;
        }

        this.power.statusPattern = /1/; // default pattern
        try {
            this.power.statusPattern = this.parsePattern(config.statusPattern);
        } catch (error) {
            this.log.warn("Property 'power.statusPattern' was given in an unsupported type. Using the default one!");
        }

        if (config.outletInUse) {
            if (typeof config.outletInUse !== "object") {
                this.log.warn("Property 'outletInUse' needs to be an object!");
                return false;
            }

            if (!config.outletInUse.statusUrl) {
                this.log.warn("Property 'outletInUse' was defined, however 'outletInUse.statusUrl' is missing although it's required!");
                return false;
            }

            this.outletInUse = {};
            try {
                this.outletInUse.statusUrl = configParser.parseUrlProperty(config.outletInUse.statusUrl);
            } catch (error) {
                this.log.warn(`Error occurred while parsing 'outletInuse.statusUrl': ${error.message}`);
                return false;
            }

            this.outletInUse.statusPattern = /1/; // default pattern
            try {
                this.outletInUse.statusPattern = this.parsePattern(config.outletInUse.statusPattern);
            } catch (error) {
                this.log.warn("Property 'outletInUse.statusPattern' was given in an unsupported type. Using the default one!");
            }
        }

        return true;
    },

    parsePattern: function (property) {
        if (typeof property === "string")
            return  new RegExp(property);
        else
            throw new Error("Unsupported type for pattern");
    },

    identify: function (callback) {
        this.log("Identify requested!");
        callback();
    },

    getServices: function () {
        if (!this.homebridgeService)
            return [];

        const informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, "Andreas Bauer")
            .setCharacteristic(Characteristic.Model, "HTTP Outlet")
            .setCharacteristic(Characteristic.SerialNumber, "OT01")
            .setCharacteristic(Characteristic.FirmwareRevision, packageJSON.version);

        return [informationService, this.homebridgeService];
    },

    handleNotification: function (body) {
        if (!this.homebridgeService.testCharacteristic(body.characteristic)) {
            this.log("Encountered unknown characteristic when handling notification (or characteristic which wasn't added to the service): " + body.characteristic);
            return;
        }

        let value = body.value;

        if (body.characteristic === "On" && this.pullTimer)
            this.pullTimer.resetTimer();

        this.log("Updating '" + body.characteristic + "' to new value: " + body.value);
        this.homebridgeService.getCharacteristic(body.characteristic).updateValue(value);
    },

    getPowerState: function (callback) {
        if (this.pullTimer)
            this.pullTimer.resetTimer();

        if (!this.statusCache.shouldQuery()) {
            const value = this.homebridgeService.getCharacteristic(Characteristic.On).value;
            if (this.debug)
                this.log(`getPowerState() returning cached value '${value? "ON": "OFF"}'${this.statusCache.isInfinite()? " (infinite cache)": ""}`);

            callback(null, value);
            return;
        }

        http.httpRequest(this.power.statusUrl, (error, response, body) => {
           if (error) {
               this.log("getPowerState() failed: %s", error.message);
               callback(error);
           }
           else if (!http.isHttpSuccessCode(response.statusCode)) {
               this.log(`getPowerState() http request returned http error code ${response.statusCode}: ${body}`);
               callback(new Error("Got html error code " + response.statusCode));
           }
           else {
               if (this.debug)
                   this.log(`getPowerState() request returned successfully (${response.statusCode}). Body: '${body}'`);

               const switchedOn = this.power.statusPattern.test(body);
               if (this.debug)
                   this.log("getPowerState() power is currently %s", switchedOn? "ON": "OFF");

               this.statusCache.queried();
               callback(null, switchedOn);
           }
        });
    },

    setPowerState: function (on, callback) {
        if (this.pullTimer)
            this.pullTimer.resetTimer();

        const urlObject = on ? this.power.onUrl : this.power.offUrl;
        http.httpRequest(urlObject, (error, response, body) => {
            if (error) {
                this.log("setPowerState() failed: %s", error.message);
                callback(error);
            }
            else if (!http.isHttpSuccessCode(response.statusCode)) {
                this.log(`setPowerState() http request returned http error code ${response.statusCode}: ${body}`);
                callback(new Error("Got html error code " + response.statusCode));
            }
            else {
                if (this.debug)
                    this.log(`setPowerState() Successfully set power to ${on? "ON": "OFF"}. Body: '${body}'`);

                callback();
            }
        });
    },

    getOutletInUse: function (callback) {
        if (!this.outletInUseCache.shouldQuery()) {
            const value = this.homebridgeService.getCharacteristic(Characteristic.OutletInUse).value;
            if (this.debug)
                this.log(`getOutletInUse() returning cached value '${value}'${this.outletInUseCache.isInfinite()? " (infinite cache)": ""}`);

            callback(null, value);
            return;
        }

        http.httpRequest(this.outletInUse.statusUrl, (error, response, body) => {
            if (error) {
                this.log("getOutletInUse() failed: %s", error.message);
                callback(error);
            }
            else if (!http.isHttpSuccessCode(response.statusCode)) {
                this.log(`getOutletInUse() http request returned http error code ${response.statusCode}: ${body}`);
                callback(new Error("Got html error code " + response.statusCode));
            }
            else {
                if (this.debug)
                    this.log(`getOutletInUse() request returned successfully (${response.statusCode}). Body: '${body}'`);

                let outletInUse = this.outletInUse.statusPattern.test(body);
                if (this.debug)
                    this.log(`getOutletInUse() outlet is currently ${outletInUse? "": "NOT "}IN USE`);

                this.outletInUseCache.queried();
                callback(null, outletInUse);
            }
        });
    },

};