const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const staffModel = require('../../models/admin/staff.model');
const orderModel = require('../../models/users/order.model');

router.get('/' , helper.staffAuthenticateToken , async (req , res) => {
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let staffMemberData = await primary.model(constants.MODELS.staffies , staffModel).findById(req.token._id).lean();
        if(staffMemberData && staffMemberData != null && staffMemberData.status === true){
            if(req.Token === staffMemberData.token){
                const todayDate = new Date();
                let todayorders = parseInt(await primary.model(constants.MODELS.orders , orderModel).countDocuments({createdAt: {$gt: todayDate}}));
                let data = {
                    todayorders: parseInt(todayorders)
                };
                return responseManager.onSuccess('Orders details...!' , data , res);
            }else{
                return responseManager.unauthorisedRequest(res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get staff member, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get staff member, Please try again...!'}, res);
    }
});

module.exports = router;