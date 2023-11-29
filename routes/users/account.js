const express = require('express');
const router = express.Router();

const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const mycycleModel = require('../../models/users/mycycle.model');
const mongoose = require('mongoose');

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
        let childAccounts = await primary.model(constants.MODELS.users, userModel).find({parentId: userData._id , status: true}).select('_id name is_parent').lean();
        let data = {
          parentAccount: parentAccount,
          childAccounts: childAccounts
        };
        return responseManager.onSuccess('Child accounts details...!', data , res);
      }else{
        let parentAccount = await primary.model(constants.MODELS.users, userModel).findById(userData.parentId).select('_id name is_parent').lean();
        let childAccounts = await primary.model(constants.MODELS.users, userModel).find({parentId: userData._id , status: true}).select('_id name is_parent').lean();
        let data = {
          parentAccount: parentAccount,
          childAccounts: childAccounts
        };
        return responseManager.onSuccess('All Accounts data...!', data, res);
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
            if(cycle){
              if(period_days){
                if(dob){
                  if(last_period_end_date){
                    if(last_period_end_date){
                      const next_period_start_date = helper.addDaysToTimestamp(last_period_end_date , cycle-1); // This function give me timestamp of next day of after 28 days but i want to get timestamp of after 28 days so i minus 1 day in cycle to get timestamp of after 28 days...
                      const next_period_end_date = helper.addDaysToTimestamp(next_period_start_date , period_days-1); // same reason...
                      let obj = {
                        mobile: '',
                        name: name,
                        goal: goal,
                        cycle: cycle,
                        period_days: period_days,
                        period_start_date: next_period_start_date,
                        period_end_date: next_period_end_date,
                        dob: dob,
                        is_profile_completed: true,
                        is_parent: false,
                        parentId: new mongoose.Types.ObjectId(userData._id),
                        createdBy: new mongoose.Types.ObjectId(req.token._id)
                      };
                      const childData = await primary.model(constants.MODELS.users, userModel).create(obj);
                      let lastCycle = {
                        period_start_date: last_period_start_date,
                        period_end_date: last_period_end_date,
                        period_days: period_days,
                        createdBy: new mongoose.Types.ObjectId(childData._id)   
                      };
                      await primary.model(constants.MODELS.mycycles , mycycleModel).create(lastCycle);
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