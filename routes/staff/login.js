const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const staffModel = require('../../models/admin/staff.model');

router.post('/' , async (req , res) => {
    const {mobile , password} = req.body;
    if(mobile && mobile.trim() != '' && mobile.length === 10 && /^\d+$/.test(mobile) && password && password.trim() != ''){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let staffMemberData = await primary.model(constants.MODELS.staffies , staffModel).findOne({mobile: mobile}).lean();
        if(staffMemberData && staffMemberData != null && staffMemberData.status === true){
            let decryptedPassword = await helper.passwordDecryptor(staffMemberData.password);
            if(decryptedPassword === password){
                let accessToken = await helper.generateAccessToken({_id: staffMemberData._id});
                let obj = {
                    token: accessToken,
                    updatedBy: new mongoose.Types.ObjectId(staffMemberData._id),
                    updatedAt: new Date()
                };
                let updatedStaffMemberData = await primary.model(constants.MODELS.staffies , staffModel).findByIdAndUpdate(staffMemberData._id , obj , {returnOriginal: false}).lean();
                let data = {
                    accessToken: updatedStaffMemberData.token,
                    name: staffMemberData.name,
                    mobile: staffMemberData.mobile
                };
                return responseManager.onSuccess('Login successfully...!' , data , res);
            }else{
                return responseManager.badrequest({message: 'Invalid mobile or password to login...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid mobile or password to login...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid mobile or password to login...!'}, res);
    }
});

module.exports = router;