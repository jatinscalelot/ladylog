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
const subscribeModel = require('../../models/users/subscribe.model');
const async = require('async');

router.post('/plans', helper.authenticateToken, async (req, res) => {
  const { sizeId, quantity, date, addressId } = req.body;
  if (req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)) {
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if (userData && userData != null && userData.status === true) {
      if (sizeId && sizeId.trim() != '' && mongoose.Types.ObjectId.isValid(sizeId)) {
        let sizeData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(sizeId).select('_id size_name status').lean();
        if (sizeData && sizeData != null && sizeData.status === true) {
          if (quantity && Number.isInteger(quantity) && quantity > 0) {
            if (addressId && addressId.trim() != '' && mongoose.Types.ObjectId.isValid(addressId)) {
              let addressData = await primary.model(constants.MODELS.addresses, addressModel).findOne({ _id: new mongoose.Types.ObjectId(addressId), createdBy: userData._id }).lean();
              if (addressData && addressData != null && addressData.status === true) {
                if (date && Number.isInteger(date) && date >= 1 && date <= 28) {
                  let plans = await primary.model(constants.MODELS.plans, planModel).find({ status: true }).select('-createdBy -updatedBy -createdAt_timestamp -createdAt -updatedAt -__v').lean();
                  if (plans && plans.length > 0) {
                    async.forEachSeries(plans, (plan, next_plan) => {
                      plan.expectedDeliveryDates = [];
                      let pad_quantity = parseInt(quantity * plan.no_of_cycle);
                      let pad_price = 5;
                      let original_amount = parseFloat((pad_quantity * pad_price).toFixed(2));
                      let discount = 0;
                      let discounted_amount = 0;
                      if (plan.discount_per && plan.discount_per > 0) {
                        discount = parseFloat(parseFloat(parseFloat(parseFloat(original_amount) * parseFloat(plan.discount_per)) / 100).toFixed(2));
                        discounted_amount = parseFloat((original_amount - discount).toFixed(2));
                      } else {
                        discounted_amount = parseFloat(original_amount.toFixed(2))
                      }
                      plan.per_cycle_quantity = parseInt(quantity);
                      plan.pad_quantity = parseInt(pad_quantity);
                      plan.original_amount = parseFloat(original_amount.toFixed(2));
                      plan.discount = parseFloat(discount.toFixed(2));
                      plan.discounted_amount = parseFloat(discounted_amount.toFixed(2));
                      plan.size = sizeData;
                      plan.address = new mongoose.Types.ObjectId(addressData._id);
                      plan.date = parseInt(date);
                      let cycle_array = [];
                      let no_of_cycle = parseInt(plan.no_of_cycle);
                      for (let i = 0; i < no_of_cycle; i++) {
                        let obj = { "cycle_no": i };
                        cycle_array.push(obj);
                      }
                      let currentDate = new Date();
                      let x = currentDate.getFullYear() + '-' + (currentDate.getMonth() <= 9 ? '0' : '') + (parseInt(parseInt(currentDate.getMonth()) + 1)) + '-' + (date <= 9 ? '0' : '') + date + 'T00:00:00.000Z';
                      let dateObj = new Date(x);
                      let Difference_In_Time = dateObj.getTime() - currentDate.getTime();
                      let Difference_In_Days = Math.round(Difference_In_Time / (1000 * 3600 * 24));
                      if(Difference_In_Days >= 1){
                        Difference_In_Days = Difference_In_Days + 2;
                      }
                      async.forEachSeries(cycle_array, (cycle, next_cycle) => {
                        if (Difference_In_Days >= 10) {
                          let y = currentDate.getFullYear() + '-' + (parseInt(parseInt(currentDate.getMonth()) + 1 + parseInt(cycle.cycle_no)) <= 9 ? '0' : '') + (parseInt(parseInt(currentDate.getMonth()) + 1 + parseInt(cycle.cycle_no))) + '-' + (date <= 9 ? '0' : '') + date + 'T00:00:00.000Z';
                          const nextMonthDate = new Date(y);
                          plan.expectedDeliveryDates.push(nextMonthDate);
                        } else {
                          let nextMonth = currentDate.getMonth() + 1 + 1;
                          let y = currentDate.getFullYear() + '-' + (parseInt(nextMonth + parseInt(cycle.cycle_no)) <= 9 ? '0' : '') + (nextMonth + parseInt(cycle.cycle_no)) + '-' + (date <= 9 ? '0' : '') + date + 'T00:00:00.000Z';
                          const nextMonthDate = new Date(y);
                          plan.expectedDeliveryDates.push(nextMonthDate);
                        }
                        next_cycle();
                      }, () => {
                        next_plan();
                      });
                    }, () => {
                      return responseManager.onSuccess('Plans details...!', plans, res);
                    });
                  } else {
                    return responseManager.badrequest({ message: 'No plan found...!' }, res);
                  }
                } else {
                  return responseManager.badrequest({ message: 'Select valid date...!' }, res);
                }
              } else {
                return responseManager.badrequest({ message: 'Invalid id to get address, Please try again...!' }, res);
              }
            } else {
              return responseManager.badrequest({ message: 'Invalid id to get address, Please try again...!' }, res);
            }
          } else {
            return responseManager.badrequest({ message: 'Invalid quantity...!' }, res);
          }
        } else {
          return responseManager.badrequest({ message: 'Invalid id to get size, Please try again...!' }, res);
        }
      } else {
        return responseManager.badrequest({ message: 'Invalid id to get size, Please try again...!' }, res);
      }
    } else {
      return responseManager.badrequest({ message: 'Invalid token to get user, Please try again...!' }, res);
    }
  } else {
    return responseManager.badrequest({ message: 'Invalid token to get user, Please try again...!' }, res);
  }
});

router.get('/sizes', helper.authenticateToken, async (req, res) => {
  if (req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)) {
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if (userData && userData != null && userData.status === true) {
      let sizes = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).find({ status: true }).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
      return responseManager.onSuccess('All plans data...', sizes, res);
    } else {
      return responseManager.badrequest({ message: 'Invalid token to get user, Please try again...!' }, res);
    }
  } else {
    return responseManager.badrequest({ message: 'Invalid token to get user, Please try again...!' }, res);
  }
});

router.post('/buy', helper.authenticateToken, async (req, res) => {
  const { paymentId, planId, quantity, date , sizeId, addressId } = req.body;
  if (req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)) {
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if (userData && userData != null && userData.status === true) {
      if (userData.is_subscriber === false) {
        if (paymentId && paymentId.trim() != '') {
          if (planId && planId.trim() != '' && mongoose.Types.ObjectId.isValid(planId)) {
            let planData = await primary.model(constants.MODELS.plans, planModel).findById(planId).lean();
            if (planData && planData != null && planData.status === true) {
              if (sizeId && sizeId.trim() != '' && mongoose.Types.ObjectId.isValid(sizeId)) {
                let sizeData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(sizeId).lean();
                if (sizeData && sizeData != null && sizeData.status === true) {
                  if (addressId && addressId.trim() != '' && mongoose.Types.ObjectId.isValid(addressId)) {
                    let addressData = await primary.model(constants.MODELS.addresses, addressModel).findOne({ _id: new mongoose.Types.ObjectId(addressId), createdBy: new mongoose.Types.ObjectId(userData._id) }).lean();
                    if (addressData && addressData != null && addressData.status === true) {
                      if(date && Number.isInteger(date) && date >= 1 && date <= 28){
                        let no_of_cycle = parseInt(planData.no_of_cycle);
                        // let no_of_cycle = 35;
                        let per_cycle_quantity = parseInt(quantity);
                        let total_quantity = parseInt(per_cycle_quantity * no_of_cycle);
                        let pad_price = 5;
                        let original_amount = parseFloat((total_quantity * pad_price).toFixed(2));
                        let discount = 0;
                        let discounted_amount = 0;
                        if (planData.discount_per && planData.discount_per > 0) {
                          discount = parseFloat(parseFloat(parseFloat(parseFloat(original_amount) * parseFloat(planData.discount_per)) / 100).toFixed(2));
                          discounted_amount = parseFloat((original_amount - discount).toFixed(2));
                        } else {
                          discounted_amount = parseFloat(original_amount.toFixed(2));
                        }
                        let currentDate = new Date();
                        let x = currentDate.getFullYear() + '-' + (currentDate.getMonth() <= 9 ? '0' : '') + (parseInt(parseInt(currentDate.getMonth()) + 1)) + '-' + (date <= 9 ? '0' : '') + date + 'T00:00:00.000Z';
                        let dateObj = new Date(x);
                        let Difference_In_Time = dateObj.getTime() - currentDate.getTime();
                        let Difference_In_Days = Math.round(Difference_In_Time / (1000 * 3600 * 24));
                        if(Difference_In_Days >= 1){
                          Difference_In_Days = Difference_In_Days + 2;
                        }
                        let delivery_dates = [];
                        if(Difference_In_Days >= 10){
                          let obj = {
                            delivery_date: dateObj,
                            delivery_timestamp: dateObj.getTime(),
                          };
                          delivery_dates.push(obj);
                        }else{
                          let nextDateObj = new Date(dateObj.getFullYear() , dateObj.getMonth() + 1 , date , 0 , 0);
                          let nextDateTimestamp = parseInt(nextDateObj.getTime() + 19800000);
                          let nextDate = new Date(nextDateTimestamp);
                          let obj = {
                            delivery_date: nextDate,
                            delivery_timestamp: nextDateTimestamp,
                          };
                          delivery_dates.push(obj);
                        }
                        let cycle_array = [];
                        for (let i = 0; i < no_of_cycle - 1; i++) {
                          let obj = {
                            cycle_no: i
                          };
                          cycle_array.push(obj);
                        }
                        async.forEachSeries(cycle_array, (cycle , next_cycle) => {
                          if (Difference_In_Days >= 10) {
                            let length_of_delivery_dates = delivery_dates.length;
                            let lastDateObj = delivery_dates[length_of_delivery_dates - 1].delivery_date;
                            let nextDateObj = new Date(lastDateObj.getFullYear() , lastDateObj.getMonth() + 1 , date , 0 , 0);
                            let nextDateTimestamp = parseInt(nextDateObj.getTime() + 19800000);
                            let nextDate = new Date(nextDateTimestamp);
                            let obj = {
                              delivery_date: nextDate,
                              delivery_timestamp: nextDateTimestamp,
                            };
                            delivery_dates.push(obj);
                          } else {
                            let length_of_delivery_dates = delivery_dates.length;
                            let lastDateObj = delivery_dates[length_of_delivery_dates - 1].delivery_date;
                            let nextDateObj = new Date(lastDateObj.getFullYear() , lastDateObj.getMonth() + 1 , date , 0 , 0);
                            let nextDateTimestamp = parseInt(nextDateObj.getTime() + 19800000);
                            let nextDate = new Date(nextDateTimestamp);
                            let obj = {
                              delivery_date: nextDate,
                              delivery_timestamp: nextDateTimestamp,
                            };
                            delivery_dates.push(obj);
                          }
                          next_cycle();
                        }, () => {
                          ( async () => {
                            let subscribePlanObj = {
                              paymentId: paymentId.trim(),
                              plan: {
                                planId: new mongoose.Types.ObjectId(planData._id),
                                plan_type: planData.plan_type,
                                no_of_cycle: parseInt(planData.no_of_cycle),
                                discount_per: parseFloat(planData.discount_per.toFixed(2))
                              },
                              per_cycle_quantity: parseInt(per_cycle_quantity),
                              total_quantity: parseInt(total_quantity),
                              original_amount: parseFloat(original_amount.toFixed(2)),
                              discount: parseFloat(discount.toFixed(2)),
                              discounted_amount: parseFloat(discounted_amount.toFixed(2)),
                              size: new mongoose.Types.ObjectId(sizeData._id),
                              address: new mongoose.Types.ObjectId(addressData._id),
                              remaining_cycle: parseInt(planData.no_of_cycle),
                              delivery_dates: delivery_dates,
                              active: true,
                              buyAt: new Date(),
                              buyAt_timestamp: parseInt(Date.now()),
                              createdBy: new mongoose.Types.ObjectId(userData._id)
                            };
                            let newSubscribePlan = await primary.model(constants.MODELS.subscribes, subscribeModel).create(subscribePlanObj);
                            let userObj = {
                              is_subscriber: true,
                              active_subscriber_plan: new mongoose.Types.ObjectId(newSubscribePlan._id),
                              active_plan_Id: new mongoose.Types.ObjectId(planData._id),
                              updatedBy: new mongoose.Types.ObjectId(userData._id),
                              updatedAt: new Date()
                            };
                            let updatedUserData = await primary.model(constants.MODELS.users, userModel).findByIdAndUpdate(userData._id, userObj, { returnOriginal: false }).lean();
                            return responseManager.onSuccess('subscribe successfully...!', 1, res);
                          })().catch((error) => {
                            return responseManager.onError(error , res);
                          });
                        });
                      }else{
                        return responseManager.badrequest({message: 'Invalid date...!'}, res);
                      }
                    } else {
                      return responseManager.badrequest({ message: 'Invalid id to get address...!' }, res);
                    }
                  } else {
                    return responseManager.badrequest({ message: 'Invalid id to get address...!' }, res);
                  }
                } else {
                  return responseManager.badrequest({ message: 'Invalid id to get size, Please try again...!' }, res);
                }
              } else {
                return responseManager.badrequest({ message: 'Invalid id to get size, Please try again...!' }, res);
              }
            } else {
              return responseManager.badrequest({ message: 'Invalid id to get plan...!' }, res);
            }
          } else {
            return responseManager.badrequest({ message: 'Invalid id to get plan...!' }, res);
          }
        } else {
          return responseManager.badrequest({ message: 'Invalid payment id to get payment details...!' }, res);
        }
      } else {
        return responseManager.badrequest({ message: 'You are subscriber user...!' }, res);
      }
    } else {
      return responseManager.badrequest({ message: 'Invalid token to get user, Please try again...!' }, res);
    }
  } else {
    return responseManager.badrequest({ message: 'Invalid token to get user, Please try again...!' }, res);
  }
});

module.exports = router;