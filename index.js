

import { getNewPrivateAPI, getNewPublicAPI } from './src/iota-pay-api';
import * as IotaPayUtil  from './src/iota-pay-static';
import * as codes from './src/codes';
import * as SchemaValidation from './src/schema-validation';

import * as ORIGIN from './src/messages/ORIGIN';
import * as PAYMENT_CHANNEL from './src/messages/PAYMENT_CHANNEL';
import * as COM_CONTROL from './src/messages/COM_CONTROL';
import * as UPGRADE_VERSION from './src/messages/UPGRADE_VERSION';
import * as TERMINATE from './src/messages/TERMINATE';
import * as SIGNAL_STOP from './src/messages/SIGNAL_STOP';
import * as ADD_LIST from './src/messages/ADD_LIST';

var EventCodes = codes;
var MessageFunctions = {
    ORIGIN: ORIGIN,
    PAYMENT_CHANNEL: PAYMENT_CHANNEL,
    COM_CONTROL: COM_CONTROL,
    UPGRADE_VERSION: UPGRADE_VERSION,
    TERMINATE: TERMINATE,
    SIGNAL_STOP: SIGNAL_STOP,
    ADD_LIST: ADD_LIST
}

export {getNewPrivateAPI, getNewPublicAPI, IotaPayUtil, EventCodes, SchemaValidation, MessageFunctions}
 