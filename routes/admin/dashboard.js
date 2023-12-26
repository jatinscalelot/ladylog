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
const orderModel = require('../../models/users/order.model');
const async = require('async');

router.get('/count' , helper.authenticateToken ,  async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let admin = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(admin && admin != null){
      let totalUsers = parseInt(await primary.model(constants.MODELS.users , userModel).countDocuments({}));
      let parentUsers = parseInt(await primary.model(constants.MODELS.users, userModel).countDocuments({is_parent: true}));
      let chilUsers = parseInt(await primary.model(constants.MODELS.users, userModel).countDocuments({is_parent: false}));
      let activeUsers = parseInt(await primary.model(constants.MODELS.users, userModel).countDocuments({status: true}));
      let inactiveUsers = parseInt(await primary.model(constants.MODELS.users, userModel).countDocuments({status: false}));
      let pendingOrders = parseInt(await primary.model(constants.MODELS.orders, orderModel).countDocuments({fullfill_status: 'pending'}));
      let readyToShipOrders = parseInt(await primary.model(constants.MODELS.orders, orderModel).countDocuments({fullfill_status: 'ready_to_ship'}));
      let deliveredOrders = parseInt(await primary.model(constants.MODELS.orders, orderModel).countDocuments({fullfill_status: 'delivered'}));
      let obj = {
        totalusers: parseInt(totalUsers),
        parentusers: parseInt(parentUsers),
        chilusers: parseInt(chilUsers),
        activeusers: parseInt(activeUsers),
        inactiveusers: parseInt(inactiveUsers),
        totalorders: parseInt(pendingOrders + readyToShipOrders),
        pendingorders: parseInt(pendingOrders),
        readytoshiporders: parseInt(readyToShipOrders),
        deliveredorders: parseInt(deliveredOrders),
      };
      return responseManager.onSuccess('User and order count...!' , obj , res);
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, please try again...!'} , res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, please try again...!'} , res);
  }
});

router.post('/useroverview' , helper.authenticateToken , async (req , res) => {
  const {page , limit , search} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let admin = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(admin && admin != null){
      primary.model(constants.MODELS.users, userModel).paginate({
        $or: [
          {name: {$regex: search, $options: 'i'}},
          {mobile: {$regex: search, $options: 'i'}},
          {email: {$regex: search, $options: 'i'}}
        ],
      },{
        page,
        limit: parseInt(limit),
        select: '_id name mobile email profile_pic period_start_date period_end_date',
        sort: {createdAt: -1},
        lean: true
      }).then((users) => {
        async.forEachSeries(users.docs, (user , next_user) => {
          ( async () => {
            const currentdate_timestamp = Date.now();
            if(currentdate_timestamp >= user.period_start_date && currentdate_timestamp <= user.period_end_date){
              user.log_status = true;
            }else{
              user.log_status = false;
            }
            let lastCycle = await primary.model(constants.MODELS.mycycles , mycycleModel).find({createdBy: user._id}).sort({period_start_date: -1}).limit(1).lean();
            user.last_period_start_date = lastCycle[0].period_start_date;
            user.last_period_end_date = lastCycle[0].period_end_date;
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

router.get('/userreports' , helper.authenticateToken , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let admin = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(admin && admin != null){
      const userReports = await primary.model(constants.MODELS.users , userModel).aggregate([
        {
          $group: {
            _id: {
              year: {$year: '$createdAt'},
              month: {$month: '$createdAt'}
            },
            count: {$sum: 1}
          }
        },
        {
          $sort: {
            '_id.year': 1,
            '_id.month': 1
          }
        }
      ]);
      return responseManager.onSuccess('User reports...!' , userReports , res);
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, please try again...!'} , res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, please try again...!'} , res);
  }
});

router.get('/orderreports' , helper.authenticateToken , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let admin = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(admin && admin != null){
      const orderReports = await primary.model(constants.MODELS.orders, orderModel).aggregate([
        {
          $group: {
            _id: {
              year: {$year: '$orderAt'},
              month: {$month: '$orderAt'}
            },
            count: {$sum: 1}
          }
        },
        {
          $sort: {
            '_id.year': 1,
            '_id.month': 1
          }
        }
      ]);
      return responseManager.onSuccess('Order reports...!' , orderReports , res);
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, please try again...!'} , res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, please try again...!'} , res);
  }
});

module.exports = router;