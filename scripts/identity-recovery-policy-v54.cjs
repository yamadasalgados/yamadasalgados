"use strict";

function isLegacyCustomerCandidate(identity, { sellerId, sellerExists, selfSellerExists, ownedSellerCount, authDisabled }) {
  return !!identity && identity.role === "seller" && !sellerId &&
    !Object.prototype.hasOwnProperty.call(identity, "accountStatus") &&
    identity.schemaVersion == null && identity.isActive === true &&
    !sellerExists && !selfSellerExists && ownedSellerCount === 0 && !authDisabled;
}

function isSellerStatusCandidate(identity, { uid, seller, sellerExists, authDisabled }) {
  return !!identity && identity.role === "seller" &&
    !Object.prototype.hasOwnProperty.call(identity, "accountStatus") &&
    (identity.isActive === true || identity.active === true) &&
    identity.suspended !== true && !authDisabled && sellerExists &&
    seller?.ownerUid === uid && seller.accountStatus === "active";
}

module.exports = { isLegacyCustomerCandidate, isSellerStatusCandidate };
