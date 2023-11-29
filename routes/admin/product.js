const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const productModel = require('../../models/admin/products.model');
const sizeMasterModel = require('../../models/admin/size.master');
const upload = require('../../utilities/multer.functions');
const allowedContentTypes = require('../../utilities/content-types');
const aws = require('../../utilities/aws');

router.post('/' , helper.authenticateToken , async (req , res) => {
  const {page , limit , search} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      await primary.model(constants.MODELS.products, productModel).paginate({
        $or: [
          {title: {$regex: search, $options: 'i'}}
        ]
      },{
        page,
        limit: parseInt(limit),
        select: '-createdBy -updatedBy -createdAt -__v',
        populate: {path: 'productDetails.size' , model: primary.model(constants.MODELS.sizemasters, sizeMasterModel) , select: '_id size_name'},
        sort: {createdAt: -1},
        lean: true
      }).then((products) => {
        return responseManager.onSuccess('Products details...!', products, res);
      }).catch((error) => {
        return responseManager.onError(error, res);
      });
    }else{
      return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
  }
});

router.post('/getone' , helper.authenticateToken , async (req , res) => {
  const {productId} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
        let productData = await primary.model(constants.MODELS.products , productModel).findById(productId).select('-createdBy -updatedBy -createdAt -__v').populate({
          path: 'productDetails.size',
          model: primary.model(constants.MODELS.sizemasters, sizeMasterModel),
          select: '_id size_name'
        }).lean();
        if(productData && productData != null){
          return responseManager.onSuccess('Product details...!' , productData , res);
        }else{
          return responseManager.badrequest({message: 'Invalid producId to get product details, please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid producId to get product details, please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again.' } , res);
  }
});

router.post('/save' , helper.authenticateToken , async (req , res) => {
  const {productId , title , bannerImage , description , SKUID , productDetails , otherImages , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(title && title.trim() != ''){
        if(bannerImage && bannerImage.trim() != ''){
          if(description && description.trim() != ''){
            if(SKUID && SKUID.trim() != ''){
              if(productDetails && Array.isArray(productDetails) && productDetails.length > 0){
                if(otherImages && Array.isArray(otherImages) && otherImages.length > 0){
                  if(status === true || status === false){
                    if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
                      let productData = await primary.model(constants.MODELS.products, productModel).findById(productId).lean();
                      if(productData && productData != null){
                        let obj = {
                          title: title,
                          bannerImage: bannerImage,
                          description: description,
                          SKUID: SKUID,
                          productDetails: productDetails,
                          otherImages: otherImages,
                          status: status,
                          updatedBy: new mongoose.Types.ObjectId(adminData._id),
                          updatedAt: new Date()
                        };
                        let updatedProduct = await primary.model(constants.MODELS.products, productModel).findByIdAndUpdate(productData._id , obj , {returnOriginal: false}).lean();
                        return responseManager.onSuccess('Product data update successfully...!' , 1 , res);
                      }else{
                        return responseManager.badrequest({message: 'Invalid id to get product data, Please try again...!'}, res);
                      }
                    }else{
                      let obj = {
                        title: title,
                        bannerImage: bannerImage,
                        description: description,
                        SKUID: SKUID,
                        productDetails: productDetails,
                        otherImages: otherImages,
                        status: status,
                        createdBy: new mongoose.Types.ObjectId(adminData._id)
                      };
                      let newProduct = await primary.model(constants.MODELS.products, productModel).create(obj);
                      return responseManager.onSuccess('New product added successfully...!', 1, res);
                    }
                  }else{
                    return responseManager.badrequest({message: 'Invalid status, Please try again...!'}, res);
                  }
                }else{
                  return responseManager.badrequest({message: 'Please select at least one other image...!'}, res);
                }
              }else{
                return responseManager.badrequest({message: 'Please provide product details, Please try again...!'}, res);
              }
            }else{
              return responseManager.badrequest({message: 'Please provide SKUID for product, Please try again...!'}, res);
            }
          }else{
            return responseManager.badrequest({message: 'Please provide description for product, Please try again...!'}, res);
          }
        }else{
          return responseManager.badrequest({message: 'Please select banner image for product, Please try again...!'}, res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid title for product, Please try again...!'}, res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
  }else{
    return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
  }
});

router.post('/upload' , helper.authenticateToken , upload.single('productImages') , async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(req.file){
        if(allowedContentTypes.imagearray.includes(req.file.mimetype)){
          let sizeOfImageInMB = helper.bytesToMB(req.file.size);
          if(sizeOfImageInMB <= 5){
            aws.saveToS3WithName(req.file.buffer , 'Products' , req.file.mimetype , 'Images').then((result) => {
              let data = {
                path: result.data.Key,
              };
              return responseManager.onSuccess('Header image for product uploaded successfully...!' , data , res);
            }).catch((error) => {
              return responseManager.onError(error , res);
            });
          }else{
            return responseManager.badrequest({ message: 'Image file must be <= 5 MB, please try again' }, res);
          }
        }else{
          return responseManager.badrequest({ message: 'Invalid file type only image files allowed for profile pic, please try again' }, res);
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

// router.post('/editActive', helper.authenticateToken, async (req, res) => {
//   const {productId} = req.body;
//   if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
//     let primary = mongoConnection.useDb(constants.DEFAULT_DB);
//     let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
//     if(adminData && adminData != null){
//       if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
//         let productData = await primary.model(constants.MODELS.products, productModel).findById(productId).lean();
//         if(productData && productData != null && productData.status === false){
//           let obj = {
//             active: (productData.active) ? false : true,
//             updatedBy: new mongoose.Types.ObjectId(adminData._id),
//             updatedAt: new Date()
//           };
//           let updateProduct = await primary.model(constants.MODELS.products, productModel).findByIdAndUpdate(productData._id, obj, {returnOriginal: false}).lean();
//           return responseManager.onSuccess('Product data update successfully...!', 1, res);
//         }else{
//           return responseManager.badrequest({message: 'Invalid producId to get product details, please try again...!'}, res);
//         }
//       }else{
//         return responseManager.badrequest({message: 'Invalid producId to get product details, please try again...!'}, res);  
//       }
//     }else{
//       return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
//     }
//   }else{
//     return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
//   }
// });

router.post('/changeStatus' , helper.authenticateToken , async (req , res) => {
  const {productId , status} = req.body;
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let adminData = await primary.model(constants.MODELS.admins , adminModel).findById(req.token._id).lean();
    if(adminData && adminData != null){
      if(productId && productId.trim() != '' && mongoose.Types.ObjectId.isValid(productId)){
        let productData = await primary.model(constants.MODELS.products , productModel).findById(productId).lean();
        if(productData && productData != null){
          if(status === true || status === false){
            let obj = {
              status: status,
              updatedBy: adminData._id,
              updatedAt: new Date()
            };
            let updateProduct = await primary.model(constants.MODELS.products, productModel).findByIdAndUpdate(productData._id , obj , {returnOriginal: false}).lean();
            return responseManager.onSuccess('Product status changed successfully...!' , 1 , res);
          }else{
            return responseManager.badrequest({message: 'Invalid status, Please try again...!'}, res);
          }
        }else{
          return responseManager.badrequest({message: 'Invalid id to get product, Please try again...!'} , res);
        }
      }else{
        return responseManager.badrequest({message: 'Invalid id to get product, Please try again...!'} , res);
      }
    }else{
      return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'} , res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid toke to get admin, Please try again...!' } , res);
  }
});

module.exports = router;