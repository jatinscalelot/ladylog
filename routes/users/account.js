const express = require('express');
const router = express.Router();

const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const mycycleModel = require('../../models/users/mycycle.model');
const mongoose = require('mongoose');

function isValidTimeStamp(timestamp){
  let valid = ((new Date(timestamp)).getTime()) > 0;
  return valid;
}

router.get('/' , helper.authenticateToken , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      if(userData.is_parent === true){
        let parentAccount = {
          _id: userData._id,
          name: userData.name,
          is_parent: userData.is_parent
        };
        let Accounts = await primary.model(constants.MODELS.users, userModel).find({parentId: userData._id , status: true}).select('_id name is_parent').lean();
        Accounts.push(parentAccount);
        return responseManager.onSuccess('Child accounts details...!', Accounts , res);
      }else{
        let parentAccount = await primary.model(constants.MODELS.users, userModel).findById(userData.parentId).select('_id name is_parent').lean();
        let Accounts = await primary.model(constants.MODELS.users, userModel).find({parentId: parentAccount._id , status: true}).select('_id name is_parent').lean();
        Accounts.push(parentAccount);
        return responseManager.onSuccess('All Accounts data...!', Accounts, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

router.post('/' , helper.authenticateToken , async (req , res) => {
  const goals = ['I want to get pregnant' , 'I want to learn about my body'];
  const {name, goal, cycle, period_days, last_period_start_date, last_period_end_date , dob} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      if(userData.is_parent === true){
        if(name && name.trim() != ''){
          if(goal && goal.trim() != '' && goals.includes(goal)){
            if(cycle && Number.isInteger(cycle) && cycle >= 21 && cycle <= 100){
              if(period_days && Number.isInteger(period_days) && period_days >= 1 && period_days <= 7){
                if(dob && dob.trim() != ''){
                  if(last_period_start_date && Number.isInteger(last_period_start_date) && isValidTimeStamp(last_period_start_date)){
                    if(last_period_end_date && Number.isInteger(last_period_end_date) && isValidTimeStamp(last_period_end_date)){
                      const next_period_start_date = helper.addDaysToTimestamp(last_period_end_date , cycle-1); // This function give me timestamp of next day of after 28 days but i want to get timestamp of after 28 days so i minus 1 day in cycle to get timestamp of after 28 days...
                      const next_period_end_date = helper.addDaysToTimestamp(next_period_start_date , period_days-1); // same reason...
                      let obj = {
                        mobile: '',
                        name: name,
                        goal: goal,
                        cycle: parseInt(cycle),
                        period_days: parseInt(period_days),
                        period_start_date: next_period_start_date,
                        period_end_date: next_period_end_date,
                        dob: dob,
                        is_profile_completed: true,
                        is_parent: false,
                        parentId: new mongoose.Types.ObjectId(userData._id),
                        createdBy: new mongoose.Types.ObjectId(req.token._id),
                        createdAt_timestamp: Date.now()
                      };
                      const childData = await primary.model(constants.MODELS.users, userModel).create(obj);
                      let channelIdObj = {
                        channelID: childData._id.toString() + '_' + userData.mobile.toString(),
                        updatedBy: new mongoose.Types.ObjectId(childData._id),
                        updatedAt: new Date()
                      };
                      let updatedChildUserData = await primary.model(constants.MODELS.users, userModel).findByIdAndUpdate(childData._id , channelIdObj , {returnOriginal: false}).lean();
                      let previousCycleObj = {
                        period_start_date: new Date(last_period_start_date),
                        period_start_date_timestamp: last_period_start_date,
                        period_end_date: new Date(last_period_end_date),
                        period_end_date_timestamp: last_period_end_date,
                        createdBy: new mongoose.Types.ObjectId(updatedChildUserData._id)   
                      };
                      let previousCycle = await primary.model(constants.MODELS.mycycles , mycycleModel).create(previousCycleObj);
                      for(let i=0 ; i<12 ; i++){
                        let period_start_date_timestamp = helper.minusDaysToTimestamp(previousCycle.period_start_date_timestamp , updatedChildUserData.cycle - 1);
                        let period_end_date_timestamp = helper.addDaysToTimestamp(period_start_date_timestamp , updatedChildUserData.period_days - 1);
                        let newPreviousCycleObj = {
                          period_start_date: new Date(period_start_date_timestamp),
                          period_start_date_timestamp: period_start_date_timestamp,
                          period_end_date: new Date(period_end_date_timestamp),
                          period_end_date_timestamp: period_end_date_timestamp,
                          createdBy: new mongoose.Types.ObjectId(updatedChildUserData._id)
                        };
                        previousCycle = await primary.model(constants.MODELS.mycycles , mycycleModel).create(newPreviousCycleObj);
                      }
                      return responseManager.onSuccess('Account added successfully...!' , 1 , res);
                    }else{
                      return responseManager.badrequest({message: 'Invalid last period end date, Please try again...!'}, res);
                    }
                  }else{
                    return responseManager.badrequest({message: 'Invalid last period start date, Please try again...!'}, res);
                  }
                }else{
                  return responseManager.badrequest({message: 'Invalid date of birth, Please try again...!'}, res);
                }
              }else{
                return responseManager.badrequest({message: 'Invalid period lenght, Please try again...!'}, res);
              }
            }else{
              return responseManager.badrequest({message: 'Invalid cycle length, Please try again...!'}, res);
            }
          }else{
            return responseManager.onSuccess({message: 'Invalid goal, Please try again...!'}, res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid name, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Only parent user able to add child...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

router.post('/login' , async (req , res) => {
  const {_id} = req.body;
  if(_id && _id.trim() != '' && mongoose.Types.ObjectId.isValid(_id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(_id).lean();
    if(userData && userData != null && userData.status === true){
      let accessToken = await helper.generateAccessToken({ _id: userData._id.toString()});
      let data = {
        token: accessToken,
        is_profile_completed: userData.is_profile_completed
      };
      return responseManager.onSuccess('User login successfully...!', data , res);
    }else{
      return responseManager.badrequest({message: 'Invalid id to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid id to get user, Please try again...!'}, res);
  }
});

module.exports = router;