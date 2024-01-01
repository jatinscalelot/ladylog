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
    const {page , limit , search , planId , is_parent} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let admin = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
        if(admin && admin != null){
            let query = {};
            if(planId && planId.trim() != '' && mongoose.Types.ObjectId.isValid(planId)){
                query.active_plan_Id = new mongoose.Types.ObjectId(planId);
            }
            if(is_parent === true || is_parent === false){
                query.is_parent = is_parent;
            }
            primary.model(constants.MODELS.users, userModel).paginate({
                $or: [
                    {name: {$regex: search, $options: 'i'}},
                    {mobile: {$regex: search, $options: 'i'}},
                    {email: {$regex: search, $options: 'i'}},
                ],
                ...query
            },{
                page,
                limit: parseInt(limit),
                select: '_id name mobile email profile_pic is_parent parentId is_subscriber active_subscriber_plan active_plan_Id',
                sort: {createdAt: -1},
                lean: true
            }).then((users) => {
                async.forEachSeries(users.docs, (user , next_user) => {
                    ( async () => {
                        const currentdate_timestamp = Date.now();
                        if(user.is_parent === true){
                            let no_of_childUsers = parseInt(await primary.model(constants.MODELS.users, userModel).countDocuments({parentId: user._id}));
                            user.no_of_childUsers = parseInt(no_of_childUsers);
                        }
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

router.post('/getone' , helper.authenticateToken , async (req , res) => {
    const {userId} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            if(userId && userId.trim() != '' && mongoose.Types.ObjectId.isValid(userId)){
                let userData = await primary.model(constants.MODELS.users, userModel).findById(userId).select('_id mobile email profile_pic is_subscriber active_subscriber_plan is_parent parentId cycle dob goal name period_days active_plan_Id status').lean();
                if(userData && userData != null){
                    if(userData.is_parent === true){
                        if(userData.is_subscriber === true){
                            userData.current_plan = await primary.model(constants.MODELS.subscribes, subscribeModel).findById(userData.active_subscriber_plan).select('-status -createdBy -updatedBy -createdAt -updatedAt -__v').lean();
                        }
                        userData.previous_plan = await primary.model(constants.MODELS.subscribes, subscribeModel).find({createdBy: userData._id , active: false}).select('-status -createdBy -updatedBy -createdAt -updatedAt -__v').sort({buyAt_timestamp: -1}).limit(5).lean();
                        userData.orders = await primary.model(constants.MODELS.orders, orderModel).find({createdBy: userData._id}).select('-status -createdBy -updatedBy -createdAt -updatedAt -__v').sort({orderAt_timestamp: -1}).limit(5).lean();
                        let childUsers = await primary.model(constants.MODELS.users, userModel).find({parentId: userData._id}).select('_id mobile email profile_pic is_subscriber active_subscriber_plan is_parent parentId cycle dob goal name period_days active_plan_Id status').lean();
                        userData.no_of_childUsers = parseInt(childUsers.length);
                        async.forEachSeries(childUsers, (childUser , next_childUser) => {
                            ( async () => {
                                if(childUser.is_subscriber === true){
                                    childUser.current_plan = await primary.model(constants.MODELS.subscribes, subscribeModel).findById(childUser.active_subscriber_plan).select('-status -createdBy -updatedBy -createdAt -updatedAt -__v').lean()
                                }
                                childUser.previous_plan = await primary.model(constants.MODELS.subscribes, subscribeModel).find({createdBy: childUser._id , active: false}).sort({buyAt_timestamp: -1}).limit(5).lean();
                                childUser.orders = await primary.model(constants.MODELS.orders, orderModel).find({createdBy: childUser._id}).sort({orderAt_timestamp: -1}).limit(5).lean();
                                next_childUser();
                            })().catch((error) => {
                                return responseManager.onError(error , res);
                            });
                        }, () => {
                            userData.childUsers = childUsers;
                            return responseManager.onSuccess('User details' , userData , res);
                        });
                    }else{
                        let parentData = await primary.model(constants.MODELS.users, userModel).findById(userData.parentId).select('_id mobile email profile_pic is_subscriber active_subscriber_plan is_parent parentId cycle dob goal name period_days active_plan_Id status').lean();
                        if(parentData.is_subscriber === true){
                            parentData.current_plan = await primary.model(constants.MODELS.subscribes, subscribeModel).findById(parentData.active_subscriber_plan).select('-status -updatedBy -createdAt -updatedAt -__v').lean();
                        }
                        parentData.previous_plan = await primary.model(constants.MODELS.subscribes, subscribeModel).find({createdBy: parentData._id , active: false}).select('-status -updatedBy -createdAt -updatedAt -__v').sort({buyAt_timestamp: -1}).limit(5).lean();
                        parentData.orders = await primary.model(constants.MODELS.orders, orderModel).find({createdBy: parentData._id}).select('-status -updatedBy -createdAt -updatedAt -__v').sort({orderAt_timestamp: -1}).limit(5).lean();
                        let childUsers = await primary.model(constants.MODELS.users, userModel).find({parentId: parentData._id}).select('_id mobile email profile_pic is_subscriber active_subscriber_plan is_parent parentId cycle dob goal name period_days active_plan_Id status').lean();
                        parentData.no_of_childUsers = parseInt(childUsers.length);
                        async.forEachSeries(childUsers, (childUser , next_childUser) => {
                            ( async () => {
                                if(childUser.is_subscriber === true){
                                    childUser.current_plan = await primary.model(constants.MODELS.subscribes, subscribeModel).findById(childUser.active_subscriber_plan).select('-status -updatedBy -createdAt -updatedAt -__v').lean()
                                }
                                childUser.previous_plan = await primary.model(constants.MODELS.subscribes, subscribeModel).find({createdBy: childUser._id , active: false}).select('-status -updatedBy -createdAt -updatedAt -__v').sort({buyAt_timestamp: -1}).limit(5).lean();
                                childUser.orders = await primary.model(constants.MODELS.orders, orderModel).find({createdBy: childUser._id}).select('-status -updatedBy -createdAt -updatedAt -__v').sort({orderAt_timestamp: -1}).limit(5).lean();
                                next_childUser();
                            })().catch((error) => {
                                return responseManager.onError(error , res);
                            });
                        }, () => {
                            parentData.childUsers = childUsers;
                            return responseManager.onSuccess('User details' , parentData , res);
                        });
                    }
                }else{
                    return responseManager.badrequest({message: 'Invalid id to get user, Please try again...!'}, res);
                }
            }else{
                return responseManager.badrequest({message: 'Invalid id to get user, Please try again...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

module.exports = router;