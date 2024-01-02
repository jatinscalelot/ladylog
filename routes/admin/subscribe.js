const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const userModel = require('../../models/users/users.model');
const subscribeModel = require('../../models/users/subscribe.model');
const sizeMasterModel = require('../../models/admin/size.master');
const addressModel = require('../../models/users/address.model');

router.post('/' , helper.authenticateToken , async (req , res) => {
    const {page , limit , search , planId , active} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            const query = {};
            if(planId && planId.trim() != '' && mongoose.Types.ObjectId.isValid(planId)){
                query['plan.planId'] = new mongoose.Types.ObjectId(planId);
            }
            if(active === true || active === false){
                query.active = active;
            }
            primary.model(constants.MODELS.subscribes, subscribeModel).paginate({
                $or: [
                    {'plan.plan_type': {$regex: search, $options: 'i'}}
                  ],
                ...query
            }, {
                page,
                limit: parseInt(limit),
                select: '-status -address -updatedBy -createdAt -updatedAt -__v',
                populate: [
                    {path: 'size' , model: primary.model(constants.MODELS.sizemasters, sizeMasterModel) , select: '_id size_name'},
                    {path: 'createdBy' , model: primary.model(constants.MODELS.users, userModel) , select: '_id mobile name'}
                ],
                sort: {createdAt: -1},
                lean: true
            }).then((subscriptionPlans) => {
                return responseManager.onSuccess('Subscripber users details...!' , subscriptionPlans , res);
            }).catch((error) => {
                return responseManager.onError(error , res);
            });
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/getone' , helper.authenticateToken , async (req , res) => {
    const {subscribeId} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            if(subscribeId && subscribeId.trim() != '' && mongoose.Types.ObjectId.isValid(subscribeId)){
                let subscribeData = await primary.model(constants.MODELS.subscribes, subscribeModel).findById(subscribeId).lean();
                if(subscribeData && subscribeData != null){
                    return responseManager.onSuccess('Subscription details...!' , subscribeData , res);
                }else{
                    return responseManager.badrequest({message: 'Invalid id to get subscription details...!'}, res);
                }
            }else{
                return responseManager.badrequest({message: 'Invalid id to get subscription details...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

module.exports = router;