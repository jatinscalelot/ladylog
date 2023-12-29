const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const userModel = require('../../models/users/users.model');
const mycycleModel = require('../../models/users/mycycle.model');
const subscribeModel = require('../../models/users/subscribe.model');
const orderModel = require('../../models/users/order.model');
const async = require('async');

router.post('/analysis' , helper.authenticateToken , async (req , res) => {
    const {page , limit , search} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let admin = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
        if(admin && admin != null){
        primary.model(constants.MODELS.users, userModel).paginate({
            $or: [
                {name: {$regex: search, $options: 'i'}},
                {mobile: {$regex: search, $options: 'i'}},
                {email: {$regex: search, $options: 'i'}},
                // {active_plan_Id: {$regex: search, $options: 'i'}},
            ],
        },{
            page,
            limit: parseInt(limit),
            select: '_id name mobile email profile_pic is_subscriber active_subscriber_plan active_plan_Id',
            sort: {createdAt: -1},
            lean: true
        }).then((users) => {
            async.forEachSeries(users.docs, (user , next_user) => {
                ( async () => {
                    const currentdate_timestamp = Date.now();
                    let last_next_cycle_data = await primary.model(constants.MODELS.mycycles , mycycleModel).find({createdBy: user._id}).sort({period_start_date_timestamp: -1}).limit(2).lean();
                    let no_of_order = parseInt(await primary.model(constants.MODELS.orders, orderModel).countDocuments({createdBy: user._id , fullfill_status: 'delivered'}));
                    user.no_of_order = parseInt(no_of_order);
                    if(currentdate_timestamp >= last_next_cycle_data[0].period_start_date_timestamp  && currentdate_timestamp <= last_next_cycle_data[0].period_end_date_timestamp){
                        user.log_status = true;
                    }else{
                        user.log_status = false;
                    }
                    user.last_period_start_date = last_next_cycle_data[1].period_start_date_timestamp;
                    user.last_period_end_date = last_next_cycle_data[1].period_end_date_timestamp;
                    user.next_period_start_date = last_next_cycle_data[0].period_start_date_timestamp;
                    user.next_period_end_date = last_next_cycle_data[0].period_end_date_timestamp;
                    if( user.is_subscriber === true){
                        let subscribeData = await primary.model(constants.MODELS.subscribes, subscribeModel).findById(user.active_subscriber_plan).lean();
                        user.current_plan = subscribeData.plan.plan_type;
                    }else{
                        user.current_plan = 'free';
                    }
                    next_user();
                })().catch((error) => {
                    return responseManager.onError(error , res);
                });
            }, () => {
            return responseManager.onSuccess('User details...!' , users , res);
            });
        }).catch((error) => {
            return responseManager.onError(error , res);
        });
        }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, please try again...!'} , res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, please try again...!'} , res);
    }
});

module.exports = router;