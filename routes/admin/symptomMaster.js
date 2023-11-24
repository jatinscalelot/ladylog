const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const symptomMasterModel = require('../../models/admin/symptom.master');

router.post('/', helper.authenticateToken, async (req , res) => {
  const {pagination , page , limit , search} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id);
    if(adminData && adminData != null){
      if(pagination === true){
        await primary.model(constants.MODELS.symptomMasters, symptomMasterModel).paginate({
          $or: [
            {category_name: {$regex: search, $options: 'i'}}
          ]
        },{
          page,
          limit: parseInt(limit),
          select: '_id category_name color description status',
          sort: {createdAt: -1},
          lean: true
        }).then((symptomCategories) => {
          return responseManager.onSuccess('Symptom categories...!', symptomCategories, res);
        }).catch((error) => {
          return responseManager.onError(error, res)
        });
      }else{
        let symptomCategories = await primary.model(constants.MODELS.symptomMasters, symptomMasterModel).find({status: true}).select('_id category_name status').lean();
        return responseManager.onSuccess('List of symptom category...!' , symptomCategories , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/getone', helper.authenticateToken, async (req , res) => {
  const {categoryID} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(categoryID && categoryID.trim() != '' && mongoose.Types.ObjectId.isValid(categoryID)){
        let symptomCategory = await primary.model(constants.MODELS.symptomMasters, symptomMasterModel).findById(categoryID).select('_id category_name color description status').lean();
        if(symptomCategory && symptomCategory != null){
          return responseManager.onSuccess('Symptom category data...!', symptomCategory, res);
        }else{
          return responseManager.badrequest({message: 'Invalid symptom categoryId to get symptom category, Please try again...!'});
        }
      }else{
        return responseManager.badrequest({message: 'Invalid symptom categoryId to get symptom category, Please try again...!'});
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {categoryID , category_name , color , description , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(category_name && category_name.trim() != ''){
        if(color && color.trim() != ''){
          if(categoryID && categoryID.trim() != '' && mongoose.Types.ObjectId.isValid(categoryID)){
            let symptomCategory = await primary.model(constants.MODELS.symptomMasters, symptomMasterModel).findById(categoryID).lean();
            if(symptomCategory && symptomCategory != null){
              let obj = {
                category_name: category_name,
                color: color,
                description: (description) ? description.trim() : '',
                status: (status === true) ? status : false,
                updatedBy: new mongoose.Types.ObjectId(adminData._id),
                updatedAt: new Date()
              };
              let updateSymptomCategory = await primary.model(constants.MODELS.symptomMasters, symptomMasterModel).findByIdAndUpdate(symptomCategory._id, obj , {returnOriginal: false}).lean();
              return responseManager.onSuccess('Symptom category update successfully...!', 1 , res); 
            }else{
              return responseManager.badrequest({message: 'Invalid categoryId to get symptom category, Please try again...!'});
            }
          }else{
            let obj = {
              category_name: category_name,
              color: color,
              description: (description) ? description.trim() : '',
              status: (status) ? status : status,
              createdBy: new mongoose.Types.ObjectId(adminData._id)
            };
            let newSymptomCategory = await primary.model(constants.MODELS.symptomMasters, symptomMasterModel).create(obj);
            return responseManager.onSuccess('Symptom category added successfully...!', 1, res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid color name, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid category name, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/delete', helper.authenticateToken, async (req , res) => {
  const {categoryID} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(categoryID && categoryID.trim() != '' && mongoose.Types.ObjectId.isValid(categoryID)){
        let symptomCategory = await primary.model(constants.MODELS.symptomMasters, symptomMasterModel).findById(categoryID);
        if(symptomCategory && symptomCategory != null && symptomCategory.status === true){
          let obj = {
            status: false,
            updatedBy: new mongoose.Types.ObjectId(adminData._id),
            updatedAt: new Date()
          };
          let deleteSymptomCategory =  await primary.model(constants.MODELS.symptomMasters, symptomMasterModel).findByIdAndUpdate(symptomCategory._id, obj, {returnOriginal: false});
          return responseManager.onSuccess('Symptom category deleted successfully...!', res);
        }else{
          return responseManager.badrequest({message: 'Invalid symptom categoryId to delete symptom category, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid symptom categoryId to delete symptom category, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

module.exports = router;