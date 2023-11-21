const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const reminderMasterModel = require('../../models/admin/reminder.master');
const upload = require('../../utilities/multer.functions');
const allowedContentTypes = require('../../utilities/content-types');
const aws = require('../../utilities/aws');

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {pagination , page , limit , search} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(pagination === true){
        await primary.model(constants.MODELS.remindermasters, reminderMasterModel).paginate({
          $or: [
            {reminder_name: {$regex: search, $options: 'i'}}
          ],
          status: true
        },{
          page,
          limit: parseInt(limit),
          select: '_id reminder_name image description status',
          sort: {createdAt: -1},
          lean: true
        }).then((sizes) => {
          return responseManager.onSuccess('Remiders data...!', sizes, res);
        }).catch((error) => {
          return responseManager.onError(error, res);
        });
      }else{
        let sizes = await primary.model(constants.MODELS.remindermasters, reminderMasterModel).find({status: true}).select('_id reminder_name image description status').lean();
        return responseManager.onSuccess('List of all reminder...!' , sizes , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/getone', helper.authenticateToken, async (req , res) => {
  const {reminderId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(reminderId && reminderId.trim() != '' && mongoose.Types.ObjectId.isValid(reminderId)){
        let reminderData = await primary.model(constants.MODELS.remindermasters, reminderMasterModel).findById(reminderId).select('_id reminder_name image description status').lean();
        if(reminderData && reminderData != null && reminderData.status === true){
          return responseManager.onSuccess('Reminder data...!', reminderData, res);
        }else{
          return responseManager.badrequest({message: 'Invalid id to get reminder data, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get reminder data, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {reminderId , reminder_name , image , description , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(reminder_name && reminder_name.trim() != ''){
        if(image && image.trim() != ''){
          if(reminderId && reminderId.trim() != '' && mongoose.Types.ObjectId.isValid(reminderId)){
            let reminderData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(reminderId).lean();
            if(reminderData && reminderData != null && reminderData.status === true){
              let obj = {
                reminder_name: reminder_name,
                image: image,
                description: (description && description.trim() != '') ? description : '',
                status: (status === true) ? status : false,
                updatedBy: new mongoose.Types.ObjectId(adminData._id),
                updatedAt: new Date()
              };
              let updatedReminderData = await primary.model(constants.MODELS.remindermasters, reminderMasterModel).findByIdAndUpdate(reminderData._id , obj , {returnOriginal: false}).lean();
              return responseManager.onSuccess('Reminder data updated successfully...!' , 1 , res);
            }else{
              return responseManager.badrequest({message: 'Invalid id to get reminder data, Please try again...!'}, res);
            }
          }else{
            let obj = {
              reminder_name: reminder_name,
              image: image,
              description: (description && description.trim() != '') ? description : '',
              status: (status === true) ? status : false,
              createdBy: new mongoose.Types.ObjectId(adminData._id)
            };
            let newReminder = await primary.model(constants.MODELS.remindermasters, reminderMasterModel).create(obj);
            return responseManager.onSuccess('Reminder added successfully...!' , 1 , res);
          }
        }
      }else{
        return responseManager.badrequest({message: 'Invalid size name, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/reminderImage' , helper.authenticateToken , upload.single('reminderImage') , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(req.file){
        if(allowedContentTypes.imagearray.includes(req.file.mimetype)){
          let sizeOfImageInMB = helper.bytesToMB(req.file.size);
          if(sizeOfImageInMB <= 5){
            aws.saveToS3WithName(req.file.buffer , 'Reminders' , req.file.mimetype , 'Images').then((result) => {
              let data = {
                path: result.data.Key,
              };
              return responseManager.onSuccess('Reminder image uploaded successfully...!' , data , res);
            }).catch((error) => {
              return responseManager.onError(error , res);
            });
          }else{
            return responseManager.badrequest({ message: 'Image file must be <= 5 MB, please try again' }, res);
          }
        }else{
          return responseManager.badrequest({ message: 'Invalid file type only image files allowed for reminder image, please try again' }, res);
        }
      }else{
        return responseManager.badrequest({ message: 'Invalid file, please try again' }, res);
      }
    }else{
      return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again...!' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again...!' } , res);
  }
});

router.post('/delete' , helper.authenticateToken , async (req , res) => {
  const {reminderId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(reminderId && reminderId.trim() != '' && mongoose.Types.ObjectId.isValid(reminderId)){
        let reminderData = await primary.model(constants.MODELS.remindermasters, reminderMasterModel).findById(reminderId).lean();
        if(reminderData && reminderData != null && reminderData.status === true){
          let obj = {
            status: false,
            updatedBy: new mongoose.Types.ObjectId(adminData._id),
            updatedAt: new Date()
          };
          let updatedReminderData = await primary.model(constants.MODELS.remindermasters, reminderMasterModel).findByIdAndUpdate(reminderData._id , obj , {returnOriginal: false}).lean();
          return responseManager.onSuccess('Reminder deleted successfully...!' , 1 , res);
        }else{
          return responseManager.badrequest({message: 'Invalid id to get reminder data, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get reminder data, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

module.exports = router;