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
    const { token , fcm_token } = req.body;
    if (token && token.trim() != '') {
        await admin.auth().verifyIdToken(token).then(async (decodedToken) => {
            let primary = mongoConnection.useDb(constants.DEFAULT_DB);
            let userData = await primary.model(constants.MODELS.users, userModel).findOne({ mobile: decodedToken.phone_number }).lean();
            if(userData === null){
                let obj = {
                    user_id: decodedToken.user_id,
                    mobile: decodedToken.phone_number,
                    fcm_token: (fcm_token) ? fcm_token.trim() : '',
                    is_parent: true,
                    parentId: null,
                    exp: decodedToken.exp,
                    status: true
                };
                let newUser = await primary.model(constants.MODELS.users, userModel).create(obj);
                let updateUSer = await primary.model(constants.MODELS.users , userModel).findByIdAndUpdate(newUser._id , {channelID: newUser._id.toString() + '_' + newUser.mobile.toString()});
                let accessToken = await helper.generateAccessToken({ _id: newUser._id.toString()});
                return responseManager.onSuccess('User register successfully!', { token: accessToken , is_profile_completed: updateUSer.is_profile_completed }, res);
            }else{
                if(userData && userData && userData.is_parent === true){
                    let accessToken = await helper.generateAccessToken({ _id: userData._id.toString() });
                    return responseManager.onSuccess('User login successfully!', { token: accessToken , is_profile_completed: userData.is_profile_completed }, res);
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