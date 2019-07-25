
# homebridge-http-outlet Plugin

`homebridge-http-outlet` is a [Homebridge](https://github.com/nfarina/homebridge) plugin with which you can configure 
HomeKit outlets which forward any requests to a defined http server. This comes in handy when you already have home 
automated equipment which can be controlled via http requests. Or you have built your own equipment, for example some sort 
of outlet controlled with an wifi enabled Arduino board which than can be integrated via this plugin into Homebridge.

## Installation

First of all you need to have [Homebridge](https://github.com/nfarina/homebridge) installed. Refer to the repo for 
instructions.  
Then run the following command to install `homebridge-http-outlet`

```
sudo npm install -g homebridge-http-outlet
```

## Updating the outlet state in HomeKit

All characteristic from the _'outlet'_ service have the permission to `notify` the HomeKit controller of state 
changes. `homebridge-http-outlet` supports two concepts to send state changes to HomeKit.

### The 'pull' way:

The 'pull' way is probably the easiest to set up and supported in every scenario. `homebridge-http-outlet` requests the 
state of the outlet in an specified interval (pulling) and sends the value to HomeKit. 
However the pull way is currently only supported for the _'On'_ characteristic!  
Look for `pullInterval` in the list of configuration options if you want to configure it.

### The 'push' way:

When using the 'push' concept, the http device itself sends the updated value to `homebridge-http-outlet` whenever 
values change. This is more efficient as the new value is updated instantly and `homebridge-http-outlet` does not 
need to make needless requests when the value didn't actually change.  
However because the http device needs to actively notify the `homebridge-http-outlet` there is more work needed 
to implement this method into your http device. 

#### Using MQTT:

MQTT (Message Queuing Telemetry Transport) is a protocol widely used by IoT devices. IoT devices can publish messages
on a certain topic to the MQTT broker which then sends this message to all clients subscribed to the specified topic.
In order to use MQTT you need to setup a broker server ([mosquitto](https://github.com/eclipse/mosquitto) is a solid 
open source MQTT broker running perfectly on a device like the Raspberry Pi) and then instruct all clients to 
publish/subscribe to it.

#### Using 'homebridge-http-notification-server':

For those of you who are developing the http device by themselves I developed a pretty simple 'protocol' based on http 
to send push-updates.   
How to implement the protocol into your http device can be read in the chapter 
[**Notification Server**](#notification-server)

## Configuration:

The configuration can contain the following properties:

##### Basic configuration options:

- `accessory` \<string\> **required**: Defines the plugin used and must be set to **"HTTP-OUTLET"** for this plugin.
- `name` \<string\> **required**: Defines the name which is later displayed in HomeKit

* `onUrl` \<string | [urlObject](#urlobject)\> **required**: Defines the url (and other properties when using 
    an urlObject) which is called when you turn on the outlet.
* `offUrl` \<string | [urlObject](#urlobject)\> **required**: Defines the url (and other properties when using 
    an urlObject) which is called when you turn off the outlet.
* `statusUrl` \<string | [urlObject](#urlobject)\> **required**: Defines the url (and other properties when using 
    an urlObject) to query the current power state from the outlet. By default it expects the http server to 
    return **'1'** for ON and **'0'** for OFF leaving out any html markup.  
    You can change this using `statusPattern` option (see below).
* `statusPattern` \<string\> **optional** \(Default: **"1"**\): Defines a regex pattern which is compared to the 
    body of the http response from the `statusUrl`. When matching the status of the outlet is set to ON otherwise OFF.  
    [More about regex pattern](https://www.w3schools.com/jsref/jsref_obj_regexp.asp).

- `outletInUse` \<object\> **optional**: Defines everything related to the _'OutletInUse'_ characteristic:
    - `statusUrl` \<string | [urlObject](#urlobject)\> **required**: Defines the url (and other properties when using 
        and urlObject) to query if the outlet is currently in use. By default it expects the http server 
        to **'1'** for IN USE and **'0'** for NOT IN USE.
    - `statusPattern` \<string\> **optional** \(Default: **"1"**): Defines a regex pattern which is compared to the 
        body of the http response from the `outletInUse.statusUrl`.
        When matching the status of the outlet is set to IN USE otherwise NOT IN USE.  

##### Advanced configuration options:

* `auth` \<object\> **optional**: If your http server requires authentication, you can specify your credential in this 
object. It uses those credentials for all http requests and thus overrides all possibly specified credentials inside 
an urlObject for any characteristic.  
The object can contain the following properties:
    * `username` \<string\> **required**
    * `password` \<string\> **required**
    * `sendImmediately` \<boolean\> **optional** \(Default: **true**\): When set to **true** the plugin will send the 
        credentials immediately to the http server. This is best practice for basic authentication.  
        When set to **false** the plugin will send the proper authentication header after receiving an 401 error code 
        (unauthenticated). The response from the http server must include a proper `WWW-Authenticate` header.  
        Digest authentication requires this property to be set to **false**!

- `statusCache` \<number\> **optional** \(Default: **0**\): Defines the amount of time in milliseconds a queried value 
   of the _On_ characteristic is cached before a new request is made to the http device.  
   Default is **0** which indicates no caching. A value of **-1** will indicate infinite caching.
- `outletInUseCache` \<number\> **optional** \(Default: **0**\): Same as above, but for the _OutletInUse_ 
    characteristic

* `pullInterval` \<integer\> **optional**: The property expects an interval in **milliseconds** in which the plugin 
pulls updates from your http device. For more information read [pulling updates](#the-pull-way).  
(This option is currently only supported for the _'On'_ characteristic!)
* `mqtt` \<[mqttObject](#mqttobject)\> **optional**: Defines all properties used for mqtt connection ([More on MQTT](#using-mqtt)).  
    For configuration see [mqttObject](#mqttobject).

- `debug` \<boolean\> **optional**: If set to true debug mode is enabled and the plugin prints more detailed information.

In the [Examples](#examples) section are some example configurations to get you started.

#### UrlObject

A urlObject can have the following properties:
* `url` \<string\> **required**: Defines the url pointing to your http server
* `method` \<string\> **optional** \(Default: **"GET"**\): Defines the http method used to make the http request
* `body` \<any\> **optional**: Defines the body sent with the http request. If value is not a string it will be
converted to a JSON string automatically.
* `strictSSL` \<boolean\> **optional** \(Default: **false**\): If enabled the SSL certificate used must be valid and 
the whole certificate chain must be trusted. The default is false because most people will work with self signed 
certificates in their homes and their devices are already authorized since being in their networks.
* `auth` \<object\> **optional**: If your http server requires authentication you can specify your credential in this 
object. When defined the object can contain the following properties:
    * `username` \<string\> **required**
    * `password` \<string\> **required**
    * `sendImmediately` \<boolean\> **optional** \(Default: **true**\): When set to **true** the plugin will send the 
            credentials immediately to the http server. This is best practice for basic authentication.  
            When set to **false** the plugin will send the proper authentication header after receiving an 401 error code 
            (unauthenticated). The response must include a proper `WWW-Authenticate` header.  
            Digest authentication requires this property to be set to **false**!
* `headers` \<object\> **optional**: Using this object you can define any http headers which are sent with the http 
request. The object must contain only string key value pairs.  
  
Below is an example of an urlObject containing all properties:
```json
{
  "url": "http://example.com:8080",
  "method": "GET",
  "body": "exampleBody",
  
  "strictSSL": false,
  
  "auth": {
    "username": "yourUsername",
    "password": "yourPassword"
  },
  
  "headers": {
    "Content-Type": "text/html"
  }
}
```

#### MQTTObject

A mqttObject can have the following properties:

##### Basic configuration options:

* `host` \<string\> **required**: Defines the host of the mqtt broker.
* `port` \<number\> **optional** \(Default: **1883**\): Defines the port of the mqtt broker.
* `credentials` \<object\> **optional**: Defines the credentials used to authenticate with the mqtt broker.
    * `username` \<string\> **required**
    * `password` \<string\> **optional**
- `subscriptions` \<object | array\> **required**: Defines an array (or one single object) of subscriptions.
    - `topic` \<string\> **required**: Defines the topic to subscribe to.
    - `characteristic` \<string\> **required**: Defines the characteristic this subscription updates.
    - `messagePattern` \<string\> **optional**: Defines a regex pattern. If `messagePattern` is not specified the 
        message received will be used as value. If the characteristic expects a boolean value it is tested if the 
        specified regex is contained in the received message. Otherwise the pattern is matched against the message 
        and the data from regex group can be extracted using the given `patternGroupToExtract`.
    - `patternGroupToExtract` \<number\> **optional** \(Default: **1**\): Defines the regex group of which data is 
        extracted.

##### Advanced configuration options:

* `protocol` \<string\> **optional** \(Default: **"mqtt"**\): Defines protocol used to connect to the mqtt broker
* `qos` \<number\> **optional** \(Default: **1**\): Defines the Quality of Service (Notice, the QoS of the publisher 
           must also be configured accordingly).  
           In contrast to most implementations the default value is **1**.
    * `0`: 'At most once' - the message is sent only once and the client and broker take no additional steps to 
                            acknowledge delivery (fire and forget).
    * `1`: 'At least once' - the message is re-tried by the sender multiple times until acknowledgement is 
                            received (acknowledged delivery).
    * `2`: 'Exactly once' - the sender and receiver engage in a two-level handshake to ensure only one copy of the 
                            message is received (assured delivery).
* `clientId` \<string\> **optional** \(Default: `'mqttjs_' + Math.random().toString(16).substr(2, 8)`\): Defines clientId
* `keepalive` \<number\> **optional** \(Default: **60**\): Time in seconds to send a keepalive. Set to 0 to disable.
* `clean` \<boolean\> **optional** \(Default: **true**\): Set to false to receive QoS 1 and 2 messages while offline.
* `reconnectPeriod` \<number\> **optional** \(Default: **1000**\): Time in milliseconds after which a reconnect is tried.
* `connectTimeout` \<number\> **optional** \(Default: **30000**\): Time in milliseconds the client waits until the 
        CONNECT needs to be acknowledged (CONNACK).

Below is an example of an mqttObject containing the basic properties for an outlet service:
```json
{
  "host": "127.0.0.1",
  "port": "1883",
  
  "credentials": {
    "username": "yourUsername",
    "password": "yourPassword"
  },
  
  "subscriptions": [
    {
      "topic": "your/topic/here",
      "characteristic": "On",
      "messagePattern": "on"
    },
    {
      "topic": "your/other/topic/here",
      "characteristic": "OutletInUse",
      "messagePattern": "inuse"
    }
  ]
}
```

### Examples

#### Basic outlet with power
This is a basic outlet configuration supporting the required On and the optional OutletInUse characteristic.  
Note that every url is simply a string and are only examples. You could also define every url using a [urlObject](#urlobject).
````json
{
  "accessory": "HTTP-OUTLET",
  "name": "Outlet",
  
  "onUrl": "http://localhost/api/outletOn",
  "offUrl": "http://localhost/api/outletOff",
  "statusUrl": "http://localhost/api/outletStatus"
}
````

#### Outlet supporting outletInUse

````json
{
  "accessory": "HTTP-OUTLET",
  "name": "Outlet",
  
  "onUrl": "http://localhost/api/outletOn",
  "offUrl": "http://localhost/api/outletOff",
  "statusUrl": "http://localhost/api/outletStatus",
  
  "outletInUse": {
    "statusUrl": "http://localhost/api/isOutletInUse"
  }
}
````

## Notification Server

`homebridge-http-outlet` can be used together with 
[homebridge-http-notification-server](https://github.com/Supereg/homebridge-http-notification-server) in order to receive
updates when the state changes at your external program. For details on how to implement those updates and how to 
install and configure `homebridge-http-notification-server`, please refer to the 
[README](https://github.com/Supereg/homebridge-http-notification-server) of the repository first.

Down here is an example on how to configure `homebridge-http-outlet` to work with your implementation of the 
`homebridge-http-notification-server`.

```json
{
    "accessories": [
        {
          "accessory": "HTTP-OUTLET",
          "name": "Outlet",
          
          "notificationID": "my-outlet",
          "notificationPassword": "superSecretPassword",
          
          "onUrl": "http://localhost/api/outletOn",
          "offUrl": "http://localhost/api/outletOff",
          
          "statusUrl": "http://localhost/api/outletStatus"
        }   
    ]
}
```

* `notificationID` is an per Homebridge instance unique id which must be included in any http request.  
* `notificationPassword` is **optional**. It can be used to secure any incoming requests.

To get more details about the configuration have a look at the 
[README](https://github.com/Supereg/homebridge-http-notification-server).

**Available characteristics (for the POST body)**

Down here are all characteristics listed which can be updated with an request to the `homebridge-http-notification-server`

* `characteristic` "On": expects a boolean `value`
* `characteristic` "OutletInUse": expects a boolean `value`
