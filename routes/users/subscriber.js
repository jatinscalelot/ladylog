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

router.get('/plans' , helper.authenticateToken , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      let plans = await primary.model(constants.MODELS.plans , planModel).find({status: true}).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
      return responseManager.onSuccess('All plans data...' , plans , res);
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

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {paymentId , planId , sizeId , addressID} = req.body;
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
                  if(addressID && addressID.trim() != '' && mongoose.Types.ObjectId.isValid(addressID)){
                    let addressData = await primary.model(constants.MODELS.addresses , addressModel).findOne({_id: new mongoose.Types.ObjectId(addressID) , createdBy: new mongoose.Types.ObjectId(userData._id)}).lean();
                    if(addressData && addressData != null && addressData.status === true){
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