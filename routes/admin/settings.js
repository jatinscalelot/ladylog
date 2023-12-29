const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const settingsModel = require('../../models/admin/settings.model');

router.post('/' , helper.authenticateToken , async (req , res) => {
    const {settingId} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            if(settingId && settingId.trim() != '' && mongoose.Types.ObjectId.isValid(settingId)){
                let settingsData = primary.model(constants.MODELS.settings, settingsModel).findById(settingId).select('-__v').lean();
                if(settingsData && settingsData != null){
                    return responseManager.onSuccess('Settings data...!' , settingsData , res);
                }else{
                    return responseManager.badrequest({message: 'Invalid id to get settings, Please try again...!'}, res);
                } 
            }else{
                return responseManager.badrequest({message: 'Invalid id to get settings, Please try again...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
    const {settingId , e_commerce , subscription} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            if(settingId && settingId.trim() != '' && mongoose.Types.ObjectId.isValid(settingId)){
                let settingsData = primary.model(constants.MODELS.settings, settingsModel).findById(settingId).select('-__v').lean();
                if(settingsData && settingsData != null){
                    if(e_commerce === true || e_commerce === false){
                        if(subscription === true || subscription === false){
                            let obj = {
                                e_commerce: e_commerce,
                                subscription: subscription,
                                updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                updatedAt: new Date(),
                                updatedAt_timestamp: Date.now()
                            };
                            let updatedSettingsData = await primary.model(constants.MODELS.settings, settingsModel).findByIdAndUpdate(settingsData._id , obj , {returnOriginal: false}).lean();
                            return responseManager.onSuccess('Settings data updated successfully...!', 1 , res);
                        }else{
                            return responseManager.badrequest({message: 'Invalid subscription status...!'}, res);
                        }
                    }else{
                        return responseManager.badrequest({message: 'Invalid e-commerce status...!'}, res);
                    }
                }else{
                    return responseManager.badrequest({message: 'Invalid id to get settings, Please try again...!'}, res);
                } 
            }else{
                return responseManager.badrequest({message: 'Invalid id to get settings, Please try again...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

module.exports = router;