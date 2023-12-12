const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const productModel = require('../../models/admin/products.model');
const veriantModel = require('../../models/admin/veriants.model');
const sizeMasterModel = require('../../models/admin/size.master');
const cartModel = require('../../models/users/cart.model');
const async = require('async');

async function difference(arr1, arr2) {
  const result = [];
	let i = 0,
		j = 0;
	let flag = false;
	for (i = 0; i < arr1.length; i++) {
		j = 0;
		flag = false;
		while (j != arr2.length) {
			if (arr1[i] == arr2[j]) {
				flag = true;
				break;
			}
			j++;
		}
		if (!flag) {
			result.push(arr1[i]);
		}
	}
	flag = false;
	for (i = 0; i < arr2.length; i++) {
		j = 0;
		flag = false;
		while (j != arr1.length) {
			if (arr2[i] == arr1[j]) {
				flag = true;
				break;
			}
			j++;
		}
		if (!flag) {
			result.push(arr2[i]);
		}
	}
	return result;
}

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {page , limit} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      let cartProductsData = await primary.model(constants.MODELS.carts, cartModel).findOne({createdBy: userData._id , status: true}).lean();
      if(cartProductsData && cartProductsData != null && cartProductsData.status === true){
        primary.model(constants.MODELS.veriants, veriantModel).paginate({
          _id: {$in: cartProductsData.cart_products}
        }, {
          page,
          limit: parseInt(limit),
          limit: parseInt(limit),
          select: '-__v -createdBy -updatedBy -createdAt -updatedAt',
          populate: [
            {path: 'product' , model: primary.model(constants.MODELS.products, productModel) , select: '-__v -createdBy -updatedBy -createdAt -updatedAt'},
            {path: 'size' , model: primary.model(constants.MODELS.sizemasters, sizeMasterModel) , select: '_id size_name'},
          ],
          sort: {createdAt: -1},
          lean: true
        }).then((cartProducts) => {
          return responseManager.onSuccess('Cart products details...!' , cartProducts , res);
        }).catch((error) => {
          return responseManager.onError(error , res);
        });
      }else{
        let cartProducts = {
          docs: [],
          totalDocs: 0,
          limit: 0,
          totalPages: 0,
          page: 0,
          pagingCounter: 0,
          hasPrevPage: false,
          hasNextPage: false,
          prevPage: null,
          nextPage: null
        };
        return responseManager.onSuccess('No cart products found...!' , cartProducts , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

router.post('/save' , helper.authenticateToken ,  async (req , res) => {
  const {veriantIds} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
    if(userData && userData != null && userData.status === true){
      if(veriantIds && Array.isArray(veriantIds) && veriantIds.length > 0){
        let cartProducts = await primary.model(constants.MODELS.carts, cartModel).findOne({createdBy: userData._id}).lean();
        if(cartProducts && cartProducts != null){
          let newCartProductArray = [];
          let oldCartProductArray = cartProducts.cart_products;
          async.forEachSeries(veriantIds, (veriantId , next_veriantId) => {
            (async () => {
              if(veriantId && veriantId.trim() != '' && mongoose.Types.ObjectId.isValid(veriantId)){
                const veriantData = await primary.model(constants.MODELS.veriants, veriantModel).findById(veriantId).lean();
                if(veriantData && veriantData != null && veriantData.status === true){
                  const existInNewCartProductsArray = newCartProductArray.some(val => val.toString() === veriantData._id.toString());
                  if(!(existInNewCartProductsArray)){
                    newCartProductArray.push(new mongoose.Types.ObjectId(veriantData._id));
                  }
                  next_veriantId();
                }else{
                  return responseManager.badrequest({message: 'Invalid id to get product veriant...!'}, res);
                }
              }else{
                return responseManager.badrequest({message: 'Invalid id to get product veriant...!'}, res);
              }
            })().catch((error) => {
              return responseManager.onError(error , res);
            });
          }, () => {
            (async () => {
              let oldCartProductArrayToString = oldCartProductArray.map(String);
              let newCartProductArrayToString = newCartProductArray.map(String);
              let finalCartProductsArrayInString = await difference(oldCartProductArrayToString , newCartProductArrayToString);
              let obj = { 
                cart_products: Array.from(finalCartProductsArrayInString , (id) => new mongoose.Types.ObjectId(id)),
                status: true,
                updatedBy: new mongoose.Types.ObjectId(userData._id),
                updatedAt: new Date()
              };
              let updatedCartProducts = await primary.model(constants.MODELS.carts, cartModel).findByIdAndUpdate(cartProducts._id , obj , {returnOriginal: false});
              return responseManager.onSuccess('Cart products updated successfully...!' , 1 , res);
            })().catch((error) => {
              return responseManager.onError(error , res);
            });
          });
        }else{
          let finalCartProductsArray = [];
          async.forEachSeries(veriantIds, (veriantId , next_veriantId) => {
            (async () => {
              if(veriantId && veriantId.trim() != '' && mongoose.Types.ObjectId.isValid(veriantId)){
                let veriantData = await primary.model(constants.MODELS.veriants, veriantModel).findById(veriantId).lean();
                if(veriantData && veriantData != null && veriantData.status === true){
                  const existInFinalCartProductsArray = finalCartProductsArray.some(val => val.toString() === veriantData._id.toString());
                  if(!(existInFinalCartProductsArray)){
                    finalCartProductsArray.push(new mongoose.Types.ObjectId(veriantData._id));
                  }
                  next_veriantId();
                }else{
                  return responseManager.badrequest({message: 'Invalid id to get product veriant...!'}, res);
                }
              }else{
                return responseManager.badrequest({message: 'Invalid id to get product veriant...!'}, res); 
              }
            })().catch((error) => {
              return responseManager.onError(error , res);
            });
          }, () => {
            (async () => {
              let obj = {
                cart_products: finalCartProductsArray,
                status: true,
                createdBy: userData._id
              };
              let newCart = await primary.model(constants.MODELS.carts, cartModel).create(obj);
              return responseManager.onSuccess('Product added in cart successfully...!' , 1 , res);
            })().catch((error) => {
              return responseManager.onError(error , res);
            });
          });
        }
      }else{
        return responseManager.badrequest({message: 'Please select product to add cart...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
  }
});

module.exports = router;