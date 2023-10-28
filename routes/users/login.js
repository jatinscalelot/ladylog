let express = require('express');
let router = express.Router();
const admin = require('../../config/firebaseAdmin');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');

router.post('/', async (req, res) => {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { token } = req.body
    if (token && token.trim() != '') {
        await admin.auth().verifyIdToken(token).then(async (decodedToken) => {
            let primary = mongoConnection.useDb(constants.DEFAULT_DB);
            let userData = await primary.model(constants.MODELS.users, userModel).findOne({ mobile: decodedToken.phone_number }).lean();
            if(userData === null){
                let obj = {
                    user_id: decodedToken.user_id,
                    mobile: decodedToken.phone_number,
                    exp: decodedToken.exp,
                    is_approved: true,
                    is_login: true,
                    status: true
                }
                let insertedData = await primary.model(constants.MODELS.users, userModel).create(obj);
                let accessToken = await helper.generateAccessToken({ _id: insertedData._id.toString() });
                return responseManager.onSuccess('User register successfully!', { token: accessToken }, res);
            }else{
                if(userData){
                    let accessToken = await helper.generateAccessToken({ _id: userData._id.toString() });
                    return responseManager.onSuccess('User login successfully!', { token: accessToken }, res);
                }else{
                    return responseManager.onError({message: 'Internal server error...!'} , res);
                }
            }
        }).catch(async (error) => {
            if(error.errorInfo.code === 'auth/id-token-expired'){          
                return res.status(401).send({'status':401 ,'message': 'Token expired...!'});
              }else{
                return res.status(401).send({'status':401 ,'message': 'Unauthorized request...!'});
              }
        });
    } else {
        return responseManager.unauthorisedRequest();
    }
});
module.exports = router;