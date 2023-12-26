const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const helper = require('../../utilities/helper');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const userModel = require('../../models/users/users.model');
const symptomModel = require('../../models/admin/symptoms.model');
const symptomMasterModel = require('../../models/admin/symptom.master');
const userSymptomsModel = require('../../models/users/userSymptoms.model');
const async = require('async');

router.get('/' , helper.authenticateToken , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      let userSymptoms = await primary.model(constants.MODELS.usersymptoms, userSymptomsModel).findOne({createdBy: userData._id , status: true}).sort({createdAt: -1}).select('_id symptoms createdAt status').lean();
      if(userSymptoms && userSymptoms != null && userSymptoms.status === true){
        let symptoms = await primary.model(constants.MODELS.symptoms, symptomModel).find({_id: {$in: userSymptoms.symptoms} , status: true}).populate({
          path: 'category',
          model: primary.model(constants.MODELS.symptomMasters, symptomMasterModel),
          select: '_id category_name color'
        }).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
        userSymptoms.symptoms = symptoms;
        return responseManager.onSuccess('User symptoms...!' , userSymptoms , res);
      }else{
        return responseManager.onSuccess('No symptoms added...!', null , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

router.post('/history' , helper.authenticateToken , async (req , res) => {
  const {page , limit} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      primary.model(constants.MODELS.usersymptoms, userSymptomsModel).paginate({
        createdBy: new mongoose.Types.ObjectId(req.token._id)
      }, {
        page,
        limit: parseInt(limit),
        sort: {createdAt: -1},
        select: '-status -createdBy -updatedBy -updatedAt -__v',
        lean: true
      }).then((userSymptoms) => {
        async.forEachSeries(userSymptoms.docs, (userSymptom , next_userSymptom) => {
          ( async () => {
            let symptoms = await primary.model(constants.MODELS.symptoms, symptomModel).find({_id: {$in: userSymptom.symptoms}}).select('_id symptom_name fill_icon').lean();
            userSymptom.symptoms = symptoms;
            next_userSymptom();
          })().catch((error) => {
            return responseManager.onError(error , res);
          });
        }, () => {
          return responseManager.onSuccess('User symptoms history...!' , userSymptoms , res);
        });
      }).catch((error) => {
        return responseManager.onError(error , res);
      });
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {symptomIds} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      if(symptomIds && Array.isArray(symptomIds) && symptomIds.length > 0){
        let finalSymptomIdsArray = [];
        async.forEachSeries(symptomIds, (symptomId , next_symptomId) => {
          (async () => {
            if(symptomId && symptomId.trim() != '' && mongoose.Types.ObjectId.isValid(symptomId)){
              let symptomData = await primary.model(constants.MODELS.symptoms, symptomModel).findById(symptomId).lean();
              if(symptomData && symptomData != null && symptomData.status === true){
                finalSymptomIdsArray.push(new mongoose.Types.ObjectId(symptomData._id));
                next_symptomId();
              }else{
                return responseManager.badrequest({message: 'Invalid id to get symptom...!'}, res);
              }
            }else{
              return responseManager.badrequest({message: 'Invalid id to get symptom...!'}, res);
            }
          })().catch((error) => {
            return responseManager.onError(error , res);
          });
        }, () => {
          (async () => {
            let obj = {
              symptoms: finalSymptomIdsArray,
              status: true,
              createdBy: new mongoose.Types.ObjectId(userData._id)
            };
            let newUserSymptom = await primary.model(constants.MODELS.usersymptoms, userSymptomsModel).create(obj);
            return responseManager.onSuccess('Symptoms added successfully...!', 1 , res);
          })().catch((error) => {
            return responseManager.onError(error , res);
          });
        });
      }else{
        return responseManager.badrequest({message: 'Please select symptoms...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

module.exports = router;