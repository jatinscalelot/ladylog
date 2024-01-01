let express = require('express');
let router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const mycycleModel = require('../../models/users/mycycle.model');
const planModel = require('../../models/admin/plan.model');
const sizeMasterModel = require('../../models/admin/size.master');
const addressModel =  require('../../models/users/address.model');
const subscribeModel = require('../../models/users/subscribe.model');
const upload = require('../../utilities/multer.functions');
const allowedContentTypes = require('../../utilities/content-types');
const aws = require('../../utilities/aws');

function isValidTimeStamp(timestamp){
  let valid = ((new Date(timestamp)).getTime()) > 0;
  return valid;
}

router.get('/', helper.authenticateToken, async (req, res) => {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)) {
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if (userData && userData != null && userData.status === true) {
            let data = {
                _id: userData._id,
                name: userData.name,
                mobile: userData.mobile,
                email: userData.email,
                profile_pic: userData.profile_pic,
                dob: userData.dob,
                goal: userData.goal
            };
            if(userData.is_subscriber === true){
              let subscribeData = await primary.model(constants.MODELS.subscribes , subscribeModel).findById(userData.active_subscriber_plan).populate([
                {path: 'plan.planId' , model: primary.model(constants.MODELS.plans , planModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
                {path: 'size' , model: primary.model(constants.MODELS.sizemasters , sizeMasterModel) , select: '_id size_name'},
                {path: 'address' , model: primary.model(constants.MODELS.addresses , addressModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'}
              ]).select('-paymentId -status -createdBy -updatedBy -createdAt -updatedAt -__v').lean();
              data.plan = subscribeData;
            }
            return responseManager.onSuccess('User profile', data, res);
        } else {
            return responseManager.badrequest({ message: 'Invalid token to get user profile, please try again' }, res);
        }
    } else {
        return responseManager.badrequest({ message: 'Invalid token to get user profile, please try again' }, res);
    }
});

router.post('/', helper.authenticateToken, async (req, res) => {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const goals = ['I want to get pregnant' , 'I want to learn about my body'];
    if (req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)) {
        const {name, goal, cycle, period_days, last_period_start_date, last_period_end_date , dob} = req.body;
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null && userData.status === true){
          if(userData.is_profile_completed === false){
            if(name && name.trim() != ''){
              if(goal && goal.trim != '' && goals.includes(goal)){
                if(cycle && Number.isInteger(cycle) && cycle >= 21 && cycle <= 100){
                  if(period_days && Number.isInteger(period_days) && period_days >= 1 && period_days <= 7){
                    if(last_period_start_date && Number.isInteger(last_period_start_date) && isValidTimeStamp(last_period_start_date)){
                      if(last_period_end_date && Number.isInteger(last_period_end_date) && isValidTimeStamp(last_period_end_date)){
                        if(dob && dob.trim() != ''){
                          const next_period_start_date = helper.addDaysToTimestamp(last_period_start_date , cycle-1); // This function give me timestamp of next day of after 28 days but i want to get timestamp of after 28 days so i minus 1 day in cycle to get timestamp of after 28 days...
                          const next_period_end_date = helper.addDaysToTimestamp(next_period_start_date , period_days-1); // same reason...
                          let obj = {
                              name: name,
                              goal: goal,
                              cycle: cycle,
                              period_days: period_days,
                              period_start_date: last_period_start_date,
                              period_end_date: last_period_end_date,
                              dob: dob,
                              is_profile_completed: true,
                              updatedBy: new mongoose.Types.ObjectId(req.token._id)
                          };
                          let updatedUserData = await primary.model(constants.MODELS.users, userModel).findByIdAndUpdate(userData._id , obj , {returnOriginal: false}).lean();
                          let nextCycleObj = {
                              period_start_date: new Date(next_period_start_date),
                              period_start_date_timestamp: next_period_start_date,
                              period_end_date: new Date(next_period_end_date),
                              period_end_date_timestamp: next_period_end_date,
                              status: true,
                              createdBy: new mongoose.Types.ObjectId(updatedUserData._id)
                          };
                          let nextCycle = await primary.model(constants.MODELS.mycycles, mycycleModel).create(nextCycleObj);
                          let previousCycleObj = {
                              period_start_date: new Date(last_period_start_date),
                              period_start_date_timestamp: last_period_start_date,
                              period_end_date: new Date(last_period_end_date),
                              period_end_date_timestamp: last_period_end_date,
                              status: true,
                              createdBy: new mongoose.Types.ObjectId(updatedUserData._id)
                          };
                          let previousCycle = await primary.model(constants.MODELS.mycycles , mycycleModel).create(previousCycleObj);
                          for(let i=0 ; i<12 ; i++){
                            let period_start_date_timestamp = helper.minusDaysToTimestamp(previousCycle.period_start_date_timestamp , updatedUserData.cycle - 1);
                            let period_end_date_timestamp = helper.addDaysToTimestamp(period_start_date_timestamp , updatedUserData.period_days - 1);
                            let newPreviousCycleObj = {
                              period_start_date: new Date(period_start_date_timestamp),
                              period_start_date_timestamp: period_start_date_timestamp,
                              period_end_date: new Date(period_end_date_timestamp),
                              period_end_date_timestamp: period_end_date_timestamp,
                              status: true,
                              createdBy: new mongoose.Types.ObjectId(updatedUserData._id)
                            };
                            previousCycle = await primary.model(constants.MODELS.mycycles , mycycleModel).create(newPreviousCycleObj);
                          }
                          return responseManager.onSuccess('User profile updated successfully!', updatedUserData , res);
                        }else{
                          return responseManager.badrequest({message: 'Invalid date of birth...!'}, res);
                        }
                      }else{
                        return responseManager.badrequest({message: 'Invalid last period end date...!'}, res);
                      }
                    }else{
                      return responseManager.badrequest({message: 'Invalid last period start date...!'}, res);
                    }
                  }else{
                    return responseManager.badrequest({message: 'Invalid period days length...!'}, res);
                  }
                }else{
                  return responseManager.badrequest({message: 'Invalid cycle length...!'}, res);
                }
              }else{
                return responseManager.badrequest({message: 'Invalid goal...!'}, res);
              }
            }else{
              return responseManager.badrequest({message: 'Please enter your name...!'}, res);
            }
          }else{
            return responseManager.badrequest({message: 'Your profile is complated...!'}, res);
          }
        }else{
            return responseManager.badrequest({message: 'Invalid token to update user profile, please try again'}, res);
        }
    } else {
        return responseManager.badrequest({message: 'Invalid token to update user profile, please try again'}, res);
    }
});

router.post('/update' , helper.authenticateToken , async (req , res) => {
    const {name , email} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null && userData.status === true){
            if(name && name.trim() != ''){
                let obj = {
                    name: name.trim(),
                    email: (email && email.trim() != '' && /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)) ? email.trim() : '',
                    updatedBy: new mongoose.Types.ObjectId(userData._id),
                    updatedAt: new Date()
                };
                let updatedUserData = await primary.model(constants.MODELS.users , userModel).findByIdAndUpdate(userData._id , obj , {returnOriginal: false}).lean();
                return responseManager.onSuccess('Profile data updated successfully...!' , 1 , res);
            }else{
                return responseManager.badrequest({message: 'Please enter your name...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
});

router.post('/uploadpicture' , helper.authenticateToken , upload.single('profile_pic')  , async (req , res) => {
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
      let primary = mongoConnection.useDb(constants.DEFAULT_DB);
      let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
      if(userData && userData != null && userData.status === true){
        if(req.file){
          if(allowedContentTypes.imagearray.includes(req.file.mimetype)){
            let sizeOfImageInMB = helper.bytesToMB(req.file.size);
            if(sizeOfImageInMB <= 5){
              aws.saveToS3(req.file.buffer , userData._id.toString() , req.file.mimetype , 'profiles').then((result) => {
                let data = {
                  profile_pic: result.data.Key,
                  updatedAt: new Date(),
                  updatedBy: new mongoose.Types.ObjectId(userData._id)
                };
                (async () => {
                  const updateUser = await primary.model(constants.MODELS.users , userModel).findByIdAndUpdate(userData._id , data , {returnOriginal: false});
                  return responseManager.onSuccess('User profile updated successfully...!' , 1 , res);
                })().catch((error) => { 
                  return responseManager.onError(error , res);
                });
              }).catch((error) => {
                return responseManager.onError(error , res);
              });
            }else{
              return responseManager.badrequest({ message: 'Image file must be <= 5 MB for profile pic, please try again' }, res);
            }
          }else{
            return responseManager.badrequest({ message: 'Invalid file type only image files allowed for profile pic, please try again' }, res);
          }
        }else{
          return responseManager.badrequest({ message: 'Invalid file to update user profile pic, please try again' }, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid token to get user, please try again'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, please try again'}, res);
    }
});

module.exports = router;