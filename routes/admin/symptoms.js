const express = require('express');
const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const symptomModel = require('../../models/admin/symptoms.model');

const router = express.Router();

router.get('/' , helper.authenticateToken , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = await mongoConnection.useDb(constants.DEFAULT_DB);
    let admin = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id);
    if(admin && admin != null){
      let symptomData = await primary.model(constants.MODELS.symptoms , symptomModel).find().select('_id symptom_type name svg');
      return responseManager.onSuccess('symptoms data...!' , symptomData , res);
    }else{
      return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
  }
});

router.post('/' , helper.authenticateToken , async (req  , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = await mongoConnection.useDb(constants.DEFAULT_DB);
    let admin = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id);
    if(admin && admin != null){
      const {symptomID , symptom_type , name , svg} = req.body;
      if(symptomID && symptomID != '' && mongoose.Types.ObjectId.isValid(symptomID)){
        let symptomData = await primary.model(constants.MODELS.symptoms , symptomModel).findById(symptomID).lean();
        if(symptomData && symptomData != null){
          if(symptom_type && symptom_type.trim() != '' && name && name.trim() != '' && svg){
            let obj = {
              symptom_type: symptom_type,
              name: name,
              svg: svg,
              updatedBy: admin._id
            };
            await primary.model(constants.MODELS.symptoms , symptomModel).findByIdAndUpdate(symptomData._id , obj);
            return responseManager.onSuccess('Symptom update successfully...!' , 1 , res);
          }else{
            return responseManager.badrequest({ message: 'Invalid data to add symptom, Please try again.' } , res);
          }
        }else{
          if(symptom_type && symptom_type.trim() != '' && name && name.trim() != '' && svg){
            let obj = {
              symptom_type: symptom_type,
              name: name,
              svg: svg,
              createdBy: admin._id
            }
            await primary.model(constants.MODELS.symptoms , symptomModel).create(obj);
            return responseManager.onSuccess('Symptom add successfully...!' , 1 , res);
          }else{
            return responseManager.badrequest({ message: 'Invalid data to add symptom, Please try again.' } , res);
          }
        }
      }else{        
        if(symptom_type && symptom_type.trim() != '' && name && name.trim() != '' && svg){
          let obj = {
            symptom_type: symptom_type,
            name: name,
            svg: svg,
            createdBy: admin._id
          }
          await primary.model(constants.MODELS.symptoms , symptomModel).create(obj);
          return responseManager.onSuccess('Symptom add successfully...!' , 1 , res);
        }else{
          return responseManager.badrequest({ message: 'Invalid data to add symptom, Please try again.' } , res);
        }
      }
    }else{
      return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
  }
});

module.exports = router;