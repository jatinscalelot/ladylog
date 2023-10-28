let response = require('./response.manager');
let jwt = require("jsonwebtoken");
var CryptoJS = require("crypto-js");
const allowedContentTypes = require("./content-types").allowedContentTypes;
exports.makeid = (length) => {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
};
exports.formatAMPM = (date) => {
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    var strTime = hours + ':' + minutes + ' ' + ampm;
    return strTime;
};
exports.getFileType = (mimeType) => {
    let filteredData = allowedContentTypes.filter((element) => {
        return element.mimeType == mimeType;
    });
    return filteredData.length > 0 ? filteredData[0].fName : "";
};
exports.generateAccessToken = async (userData) => {
    return jwt.sign(userData, process.env.APP_LOGIN_AUTH_TOKEN, {});
};
exports.authenticateToken = async (req, res, next) => {
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        const bearer = bearerHeader.split(' ');
        const token = bearer[1];
        jwt.verify(token, process.env.APP_LOGIN_AUTH_TOKEN, (err, auth) => {
            if (err) {
                return response.unauthorisedRequest(res);
            } else {
                req.token = auth;
            }
        });
        next();
    } else {
        return response.unauthorisedRequest(res);
    }
};
exports.firebasetoken = async (req, res, next) => {
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        const bearer = bearerHeader.split(' ');
        const token = bearer[1];
        if (token) {
            req.token = token;
            next();
        } else {
            return responseManager.unauthorisedRequest(res);
        }
    } else {
        return response.unauthorisedRequest(res);
    }
};
exports.passwordDecryptor = async (passwordKeyDecrypt) => {
    try {
        var decLayer1 = CryptoJS.TripleDES.decrypt(passwordKeyDecrypt, process.env.PASSWORD_ENCRYPTION_SECRET);
        var deciphertext1 = decLayer1.toString(CryptoJS.enc.Utf8);
        var decLayer2 = CryptoJS.DES.decrypt(deciphertext1, process.env.PASSWORD_ENCRYPTION_SECRET);
        var deciphertext2 = decLayer2.toString(CryptoJS.enc.Utf8);
        var decLayer3 = CryptoJS.AES.decrypt(deciphertext2, process.env.PASSWORD_ENCRYPTION_SECRET);
        var finalDecPassword = decLayer3.toString(CryptoJS.enc.Utf8);
        return finalDecPassword;
    } catch (err) {
        throw err;
    }
};
exports.passwordEncryptor = async (passwordKeyEncrypt) => {
    try {
        var encLayer1 = CryptoJS.AES.encrypt(passwordKeyEncrypt, process.env.PASSWORD_ENCRYPTION_SECRET).toString();
        var encLayer2 = CryptoJS.DES.encrypt(encLayer1, process.env.PASSWORD_ENCRYPTION_SECRET).toString();
        var finalEncPassword = CryptoJS.TripleDES.encrypt(encLayer2, process.env.PASSWORD_ENCRYPTION_SECRET).toString();
        return finalEncPassword;
    } catch (err) {
        throw err;
    }
};
exports.getInvoiceNo = (invno) => {
    var inv_number = invno + 1;
    var lengoftemp = inv_number.toString().length;
    if (lengoftemp == 1) {
        inv_number = '0000000' + inv_number;
    } else if (lengoftemp == 2) {
        inv_number = '000000' + inv_number;
    } else if (lengoftemp == 3) {
        inv_number = '00000' + inv_number;
    } else if (lengoftemp == 4) {
        inv_number = '0000' + inv_number;
    } else if (lengoftemp == 5) {
        inv_number = '000' + inv_number;
    } else if (lengoftemp == 6) {
        inv_number = '00' + inv_number;
    } else if (lengoftemp == 7) {
        inv_number = '00' + inv_number;
    }
    return inv_number;
};
exports.digitTomoney = (cost) => {
    var x = parseFloat(cost).toFixed(2);
    var afterPoint = '';
    if (x.indexOf('.') > 0)
        afterPoint = x.substring(x.indexOf('.'), x.length);
    x = Math.floor(x);
    x = x.toString();
    var lastThree = x.substring(x.length - 3);
    var otherNumbers = x.substring(0, x.length - 3);
    if (otherNumbers != '')
        lastThree = ',' + lastThree;
    return otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree + afterPoint;
};
exports.addDaysToTimestamp = (timestamp , days) => {
    var date = new Date(timestamp);
    date.setDate(date.getDate() + days+1);
    var updatedTimestamp = date.getTime();
    return updatedTimestamp;
};