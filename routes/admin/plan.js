const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const planModel = require('../../models/admin/plan.model');

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {page , limit , search , is_pagination} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(is_pagination === true){
        primary.model(constants.MODELS.plans , planModel).paginate({
          $or: [
            {plan_type: {$regex: search, $options: 'i'}},
            {plan_name: {$regex: search, $options: 'i'}}
          ]
        }, {
          page,
          limit: parseInt(limit),
          select: '-createdBy -updatedBy -createdAt -createdAt_timestamp -updatedAt -__v',
          sort: {createdAt: -1},
          lean: true
        }).then((plans) => {
          return responseManager.onSuccess('Plans data...!' , plans , res);
        }).catch((error) => {
          return responseManager.onError(error , res);
        });
      }else{
        let plans = await primary.model(constants.MODELS.plans, planModel).find({status: true}).select('-createdBy -updatedBy -createdAt -createdAt_timestamp -updatedAt -__v').lean();
        return responseManager.onSuccess('All plans...!' , plans , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/getone' , helper.authenticateToken , async (req , res) => {
  const {planId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(planId && planId.trim() != '' && mongoose.Types.ObjectId.isValid(planId)){
        let planData = await primary.model(constants.MODELS.plans , planModel).findById(planId).select('-createdBy -updatedBy -createdAt -createdAt_timestamp -updatedAt -__v').lean();
        if(planData && planData != null){
          return responseManager.onSuccess('Plan data...!' , planData , res);
        }else{
          return responseManager.badrequest({message: 'Invalid id to get plan...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get plan...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {planId , plan_type , plan_name , no_of_cycle , discount_per , description , status} = req.body;
  const plan_types = ['silver' , 'gold' , 'premium'];
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(plan_type && plan_type.trim() != '' && plan_types.includes(plan_type)){
          if(plan_name && plan_name.trim() != ''){
            if(no_of_cycle && Number.isInteger(no_of_cycle) && no_of_cycle > 0){
              if(!(isNaN(discount_per)) && discount_per >= 0 && discount_per <= 100){
                if(description && description.trim() != '' && description.length <= 7000){
                  if(status === true || status === false){
                    if(planId && planId.trim() != '' && mongoose.Types.ObjectId.isValid(planId)){
                      let planData = await primary.model(constants.MODELS.plans, planModel).findById(planId).lean();
                      if(planData && planData != null){
                        if(plan_type.trim() === planData.plan_type){
                          let obj = {
                            plan_type: plan_type.trim(),
                            plan_name: plan_name.trim(),
                            no_of_cycle: parseInt(no_of_cycle),
                            discount_per: parseFloat(discount_per),
                            description: description.trim(),
                            status: status,
                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                            updatedAt: new Date()
                          };
                          let updatedPlanData = await primary.model(constants.MODELS.plans, planModel).findByIdAndUpdate(planData._id , obj , {returnOriginal: false}).lean();
                          return responseManager.onSuccess('Plan data updated successfully...!' , 1 , res);
                        }else{
                          let checkPlanExistWithSamePlanType = await primary.model(constants.MODELS.plans, planModel).findOne({plan_type: plan_type}).lean();
                          if(checkPlanExistWithSamePlanType && checkPlanExistWithSamePlanType != null){
                            return responseManager.badrequest({message: 'Plan exist with same plan type...!'}, res);
                          }else{
                            let obj = {
                              plan_type: plan_type.trim(),
                              plan_name: plan_name.trim(),
                              no_of_cycle: parseInt(no_of_cycle),
                              discount_per: parseFloat(discount_per),
                              description: description.trim(),
                              status: status,
                              updatedBy: new mongoose.Types.ObjectId(adminData._id),
                              updatedAt: new Date()
                            };
                            let updatedPlanData = await primary.model(constants.MODELS.plans, planModel).findByIdAndUpdate(planData._id , obj , {returnOriginal: false}).lean();
                            return responseManager.onSuccess('Plan data updated successfully...!' , 1 , res);
                          }
                        }
                      }else{
                        return responseManager.badrequest({message: 'Invalid id to get plan data...!'}, res);
                      }
                    }else{
                      let checkPlanExistWithSamePlanType = await primary.model(constants.MODELS.plans, planModel).findOne({plan_type: plan_type}).lean();
                      if(checkPlanExistWithSamePlanType === null){
                        let obj = {
                          plan_type: plan_type.trim(),
                          plan_name: plan_name.trim(),
                          no_of_cycle: parseInt(no_of_cycle),
                          discount_per: parseFloat(discount_per),
                          description: description.trim(),
                          status: status,
                          createdBy: new mongoose.Types.ObjectId(adminData._id),
                          createdAt_timestamp: Date.now()
                        };
                        let newPlan = await primary.model(constants.MODELS.plans, planModel).create(obj);
                        return responseManager.onSuccess('New plan added successfully...!' , 1 , res);
                      }else{
                        return responseManager.badrequest({message: 'Plan exist with same plan type...!'}, res);
                      }
                    }
                  }else{
                    return responseManager.badrequest({message: 'Invalid status...!'}, res);
                  }
                }else{
                  return responseManager.badrequest({message: 'Please provide description for plan...!'}, res);
                }
              }else{
                return responseManager.badrequest({message: 'Invalid discount persentage...!'}, res);
              }
            }else{
              return responseManager.badrequest({message: 'Invalid cycle length...!'}, res);
            }
          }else{
            return responseManager.badrequest({message: 'Please provide name for plan...!'}, res);
          }
      }else{
        return responseManager.badrequest({message: 'Invalid plan type...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/changestatus' , helper.authenticateToken , async (req , res) => {
  const {planId , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(planId && planId.trim() != '' && mongoose.Types.ObjectId.isValid(planId)){
        let planData = await primary.model(constants.MODELS.plans , planModel).findById(planId).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
        if(planData && planData != null){
          if(status === true || status === false){
            let obj = {
              status: status,
              updatedBy: new mongoose.Types.ObjectId(adminData._id),
              updatedAt: new Date()
            };
            let updatedPlanData = await primary.model(constants.MODELS.plans , planModel).findByIdAndUpdate(planData._id , obj , {returnOriginal: false}).lean();
            return responseManager.onSuccess('Plan data updated successfully...!' , 1 , res);
          }else{
            return responseManager.badrequest({message: 'Invalid status...!'}, res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid id to get plan...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get plan...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

module.exports = router;