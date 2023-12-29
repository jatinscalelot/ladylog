const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const planModel = require('../../models/admin/plan.model');
const sizeMasterModel = require('../../models/admin/size.master');
const addressModel = require('../../models/users/address.model');
const subscribeModel = require('../../models/users/subscribe.model');
const async = require('async');

router.post('/plans' , helper.authenticateToken , async (req , res) => {
  const {sizeId , quantity , addressId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      if(sizeId && sizeId.trim() != '' && mongoose.Types.ObjectId.isValid(sizeId)){
        let sizeData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(sizeId).select('_id size_name status').lean();
        if(sizeData && sizeData != null && sizeData.status === true){
          if(quantity && Number.isInteger(quantity) && quantity > 0){
            if(addressId && addressId.trim() != '' && mongoose.Types.ObjectId.isValid(addressId)){
              let addressData = await primary.model(constants.MODELS.addresses, addressModel).findOne({_id: new mongoose.Types.ObjectId(addressId) , createdBy: userData._id}).lean();
              if(addressData && addressData != null && addressData.status === true){
                let plans = await primary.model(constants.MODELS.plans, planModel).find({status: true}).select('-createdBy -updatedBy -createdAt_timestamp -createdAt -updatedAt -__v').lean();
                if(plans && plans.length > 0){
                  async.forEachSeries(plans, (plan , next_plan) => {
                    let pad_quantity = parseInt(quantity * plan.no_of_cycle);
                    let pad_price = 5;
                    let original_amount = parseFloat((pad_quantity * pad_price).toFixed(2));
                    let discount = 0;
                    let discounted_amount = 0;
                    if(plan.discount_per && plan.discount_per > 0){
                      discount = parseFloat(parseFloat(parseFloat(parseFloat(original_amount) * parseFloat(plan.discount_per)) / 100).toFixed(2));
                      discounted_amount = parseFloat((original_amount - discount).toFixed(2));
                    }else{
                      discounted_amount = parseFloat(original_amount.toFixed(2))
                    }
                    plan.per_cycle_quantity = parseInt(quantity);
                    plan.pad_quantity = parseInt(pad_quantity);
                    plan.original_amount = parseFloat(original_amount.toFixed(2));
                    plan.discount = parseFloat(discount.toFixed(2));
                    plan.discounted_amount = parseFloat(discounted_amount.toFixed(2));
                    plan.size = sizeData;
                    next_plan();
                  }, () => {
                    return responseManager.onSuccess('Plans details...!' , plans , res);
                  });
                }else{
                  return responseManager.badrequest({message: 'No plan found...!'}, res);
                }
              }else{
                return responseManager.badrequest({message: 'Invalid id to get address, Please try again...!'}, res);
              }
            }else{  
              return responseManager.badrequest({message: 'Invalid id to get address, Please try again...!'}, res);
            }
          }else{
            return responseManager.badrequest({message: 'Invalid quantity...!'}, res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid id to get size, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get size, Please try again...!'}, res);
      }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

router.get('/sizes' , helper.authenticateToken , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      let sizes = await primary.model(constants.MODELS.sizemasters , sizeMasterModel).find({status: true}).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
      return responseManager.onSuccess('All plans data...' , sizes , res);
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

router.post('/buy' , helper.authenticateToken , async (req , res) => {
  const {paymentId , planId , quantity , sizeId , addressId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      if(userData.is_subscriber === false){
        if(paymentId && paymentId.trim() != ''){
          if(planId && planId.trim() != '' && mongoose.Types.ObjectId.isValid(planId)){
            let planData = await primary.model(constants.MODELS.plans , planModel).findById(planId).lean();
            if(planData && planData != null && planData.status === true){
              if(sizeId && sizeId.trim() != '' && mongoose.Types.ObjectId.isValid(sizeId)){
                let sizeData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(sizeId).lean();
                if(sizeData && sizeData != null && sizeData.status === true){
                  if(addressId && addressId.trim() != '' && mongoose.Types.ObjectId.isValid(addressId)){
                    let addressData = await primary.model(constants.MODELS.addresses , addressModel).findOne({_id: new mongoose.Types.ObjectId(addressId) , createdBy: new mongoose.Types.ObjectId(userData._id)}).lean();
                    if(addressData && addressData != null && addressData.status === true){
                      let per_cycle_quantity = parseInt(quantity);
                      let total_quantity = parseInt(per_cycle_quantity * planData.no_of_cycle);
                      let pad_price = 5;
                      let original_amount = parseFloat((total_quantity * pad_price).toFixed(2));
                      let discount = 0;
                      let discounted_amount = 0;
                      if(planData.discount_per && planData.discount_per > 0){
                        discount = parseFloat(parseFloat(parseFloat(parseFloat(original_amount) * parseFloat(planData.discount_per)) / 100).toFixed(2));
                        discounted_amount = parseFloat((original_amount - discount).toFixed(2));
                      }else{
                        discounted_amount = parseFloat(original_amount.toFixed(2));
                      }
                      let subscribePlanObj = {
                        paymentId: paymentId.trim(),
                        plan: {
                          planId: new mongoose.Types.ObjectId(planData._id),
                          plan_type: planData.plan_type,
                          no_of_cycle: parseInt(planData.no_of_cycle),
                          discount_per: parseFloat(planData.discount_per.toFixed(2))
                        },
                        per_cycle_quantity: parseInt(per_cycle_quantity),
                        total_quantity: parseInt(total_quantity),
                        original_amount: parseFloat(original_amount.toFixed(2)),
                        discount: parseFloat(discount.toFixed(2)),
                        discounted_amount: parseFloat(discounted_amount.toFixed(2)),
                        size: new mongoose.Types.ObjectId(sizeData._id),
                        address: new mongoose.Types.ObjectId(addressData._id),
                        remaining_cycle: parseInt(planData.no_of_cycle),
                        active: true,
                        buyAt: new Date(),
                        buyAt_timestamp: parseInt(Date.now()),
                        createdBy: new mongoose.Types.ObjectId(userData._id)
                      };
                      let newSubscribePlan = await primary.model(constants.MODELS.subscribes , subscribeModel).create(subscribePlanObj);
                      let userObj = {
                        is_subscriber: true,
                        active_subscriber_plan: new mongoose.Types.ObjectId(newSubscribePlan._id),
                        active_plan_Id: new mongoose.Types.ObjectId(planData._id),
                        updatedBy: new mongoose.Types.ObjectId(userData._id),
                        updatedAt: new Date()
                      };
                      let updatedUserData = await primary.model(constants.MODELS.users , userModel).findByIdAndUpdate(userData._id , userObj , {returnOriginal: false}).lean();
                      return responseManager.onSuccess('subscribe successfully...!' , 1 , res);
                    }else{
                      return responseManager.badrequest({message: 'Invalid id to get address...!'}, res);
                    }
                  }else{
                    return responseManager.badrequest({message: 'Invalid id to get address...!'}, res);
                  }
                }else{
                  return responseManager.badrequest({message: 'Invalid id to get size, Please try again...!'}, res);
                }
              }else{
                return responseManager.badrequest({message: 'Invalid id to get size, Please try again...!'}, res);
              }
            }else{
              return responseManager.badrequest({message: 'Invalid id to get plan...!'}, res);
            }
          }else{
            return responseManager.badrequest({message: 'Invalid id to get plan...!'}, res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid payment id to get payment details...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'You are subscriber user...!'}, res);
      }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

module.exports = router;