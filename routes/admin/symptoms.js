const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const symptomModel = require('../../models/admin/symptoms.model');
const symptomMasterModel = require('../../models/admin/symptom.master');
const upload = require('../../utilities/multer.functions');
const aws = require('../../utilities/aws');

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {page , limit , search} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let admin = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id);
    if(admin && admin != null){
      await primary.model(constants.MODELS.symptoms, symptomModel).paginate({
        $or: [
          {symptom_name: {$regex: search, $options: 'i'}}
        ]
      },{
        page,
        limit: parseInt(limit),
        select: '-createdAt -updatedAt -__v -createdBy -updatedBy',
        sort: {createdAt: -1},
        populate: {path: 'category' , model: primary.model(constants.MODELS.symptomMasters, symptomMasterModel) , select: '_id category_name'},
        lean: true
      }).then((symptoms) => {
        return responseManager.onSuccess('symptoms data...!' , symptoms , res);
      }).catch((error) => {
        return responseManager.onError(error, res);
      });
    }else{
      return responseManager.badrequest({ message: 'Invalid token to get admin, Please try again.' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid token to get admin, Please try again.' } , res);
  }
});

router.post('/getone' , helper.authenticateToken , async (req , res) => {
  const {symptomID} = req.body;
  if(req.token._id  && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(symptomID && symptomID.trim() != '' && mongoose.Types.ObjectId.isValid(symptomID)){
        let symptom = await primary.model(constants.MODELS.symptoms, symptomModel).findById(symptomID).select('-createdAt -updatedAt -__v -createdBy -updatedBy').populate({
          path: 'category',
          model: primary.model(constants.MODELS.symptomMasters, symptomMasterModel),
          select: '_id category_name'
        }).lean();
        if(symptom && symptom != null){
          return responseManager.onSuccess('Symptom data...!', symptom , res);
        }else{
          return responseManager.badrequest({message: 'Invalid symptomID to get symptom, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid symptomID to get symptom, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {symptomID , symptomCategoryId , symptom_name , fill_icon , unfill_icon , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(symptomCategoryId && symptomCategoryId.trim() != '' && mongoose.Types.ObjectId.isValid(symptomCategoryId)){
        let symptomCategory = await primary.model(constants.MODELS.symptomMasters, symptomMasterModel).findById(symptomCategoryId).lean();
        if(symptomCategory && symptomCategory != null && symptomCategory.status === true){
          if(symptom_name && symptom_name.trim() != ''){
            if(fill_icon && fill_icon.trim() != ''){
              if(unfill_icon && unfill_icon.trim() != ''){
                if(symptomID && symptomID.trim() != '' && mongoose.Types.ObjectId.isValid(symptomID)){
                  let symptom = await primary.model(constants.MODELS.symptoms , symptomModel).findById(symptomID).lean();
                  if(symptom && symptom != null){
                    let obj = {
                      category: new mongoose.Types.ObjectId(symptomCategory._id),
                      symptom_name: symptom_name,
                      unfill_icon: unfill_icon.trim(),  
                      fill_icon: fill_icon.trim(),
                      status: (status === false) ? status : true,
                      updatedBy: new mongoose.Types.ObjectId(adminData._id),
                      updatedAt: new Date()
                    };
                    const updatedSymptom =  await primary.model(constants.MODELS.symptoms , symptomModel).findByIdAndUpdate(symptom._id , obj , {returnOriginal: false});
                    return responseManager.onSuccess('Symptom data updated successfully...!' , 1 , res);
                  }else{
                    return responseManager.badrequest({message: 'Invalid symptomID to update symptom data, Please try again...!'} , res);
                  }
                }else{
                  let obj = {
                    category: new mongoose.Types.ObjectId(symptomCategory._id),
                    symptom_name: symptom_name,
                    unfill_icon: unfill_icon.trim(),  
                    fill_icon: fill_icon.trim(),
                    status: (status === false) ? status : true,
                    createdBy: new mongoose.Types.ObjectId(adminData._id)
                  };
                  const newSymptom = await primary.model(constants.MODELS.symptoms , symptomModel).create(obj);
                  return responseManager.onSuccess('New symptom add successfully...!' , 1 , res);
                }
              }else{
                return responseManager.badrequest({message: 'Please select unfill icon...!'} , res);
              }
            }else{
              return responseManager.badrequest({message: 'Please select fill icon...!'} , res);
            }
          }else{
            return responseManager.badrequest({message: 'Invalid sysmtop name, Please try again...!'} , res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid id to get symptom category, Please try again...!'})
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get symptom category, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'} , res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'} , res);
  }
});

router.post('/symptomImages' , helper.authenticateToken , upload.single('symptomImages') , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(req.file){
        if(req.file.mimetype === 'image/svg+xml'){
          let sizeOfFileInMB = helper.bytesToMB(req.file.size);
          if(sizeOfFileInMB <= 5){
            aws.saveToS3WithName(req.file.buffer , 'Symptoms' , req.file.mimetype , 'Images').then((result) => {
              let data = {
                path: result.data.Key,
              };
              return responseManager.onSuccess('Symptom image upload successfully...!' , data , res);
            }).catch((error) => {
              return responseManager.onError(error , res);
            });
          }else{
            return responseManager.badrequest({ message: 'File size must be <= 5 MB, please try again' }, res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid file type, Please try again...!'} , res);
        }
      }else{
        return responseManager.badrequest({message: 'Please select symptom image...!'} , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'} , res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'} , res);
  }
});

router.post('/deleteSymptom' , helper.authenticateToken , async (req , res) => {
  const {symptomID} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(symptomID && symptomID.trim != '' && mongoose.Types.ObjectId.isValid(symptomID)){
        let symptom = await primary.model(constants.MODELS.symptoms, symptomModel).findById(symptomID).lean();
        if(symptom && symptom != null && symptom.status === true){
          let obj = {
            status: false,
            updatedBy: new mongoose.Types.ObjectId(adminData._id),
            updatedAt: new Date()
          };
          const updatedSymptom = await primary.model(constants.MODELS.symptoms , symptomModel).findByIdAndUpdate(symptom._id, obj, {returnOriginal: false}).lean();
          return responseManager.onSuccess('Symptom delete successfully...!' , 1 , res);
        }else{
          return responseManager.badrequest({message: 'Invalid symptomId to get symptom, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid symptomId to get symptom, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'} , res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'} , res);
  }
});

module.exports = router;