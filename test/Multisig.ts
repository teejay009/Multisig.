import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("MultiSig Test", function () {
    async function deployMultiSigFixture() {
        const [owner, signer1, signer2, nonSigner] = await ethers.getSigners();
        
        // Deploy parameters
        const validSigners = [owner.address, signer1.address, signer2.address];
        const quorum = 2;
        const initialBalance = ethers.parseEther("10");
        
        const MultiSig = await ethers.getContractFactory("MultiSig");
        const multiSig = await MultiSig.deploy(validSigners, quorum, { value: initialBalance });
        
        return { multiSig, owner, signer1, signer2, nonSigner, quorum };
    }

    describe("Deployment", function () {
        it("Should deploy with correct initiate transaction", async function () {
            const { multiSig, owner, signer1, signer2 } = await loadFixture(deployMultiSigFixture);
            
            // Verify contract balance
            const balance = await ethers.provider.getBalance(multiSig.target);
            expect(balance).to.equal(ethers.parseEther("10"));

            // Verify signers
            expect(await multiSig.signers(0)).to.equal(owner.address);
            expect(await multiSig.signers(1)).to.equal(signer1.address);
            expect(await multiSig.signers(2)).to.equal(signer2.address);
        });
    });

    describe("Transaction Management", function () {
        it("Should allow valid signer to initiate transaction", async function () {
            const { multiSig, signer1, signer2 } = await loadFixture(deployMultiSigFixture);
            
            const amount = ethers.parseEther("1");
            await multiSig.connect(signer1).initiateTransaction(amount, signer2.address);
            
            const transactions = await multiSig.getAllTransactions();
            expect(transactions.length).to.equal(1);
            expect(transactions[0].amount).to.equal(amount);
            expect(transactions[0].receiver).to.equal(signer2.address);
            expect(transactions[0].signersCount).to.equal(1);
        });

        it("Should not allow non-signer to initiate transaction", async function () {
            const { multiSig, nonSigner, signer1 } = await loadFixture(deployMultiSigFixture);
            
            const amount = ethers.parseEther("1");
            await expect(
                multiSig.connect(nonSigner).initiateTransaction(amount, signer1.address)
            ).to.be.revertedWith("not valid signer");
        });

        it("Should execute transaction when quorum is reached", async function () {
            const { multiSig, owner, signer1, signer2 } = await loadFixture(deployMultiSigFixture);
            
            const amount = ethers.parseEther("1");
            const initialBalance = await ethers.provider.getBalance(signer2.address);
            
            // First signer initiates
            await multiSig.connect(owner).initiateTransaction(amount, signer2.address);
            
            // Second signer approves
            await multiSig.connect(signer1).approveTransaction(1);
            
            const finalBalance = await ethers.provider.getBalance(signer2.address);
            expect(finalBalance - initialBalance).to.equal(amount);
        });

        it("Should prevent double signing", async function () {
            const { multiSig, signer1, signer2 } = await loadFixture(deployMultiSigFixture);
            
            await multiSig.connect(signer1).initiateTransaction(ethers.parseEther("1"), signer2.address);
            
            await expect(
                multiSig.connect(signer1).approveTransaction(1)
            ).to.be.revertedWith("can't sign twice");
        });
    });

    describe("Ownership Management", function () {
        it("Should transfer ownership correctly", async function () {
            const { multiSig, owner, signer1 } = await loadFixture(deployMultiSigFixture);
            
            // Transfer ownership
            await multiSig.connect(owner).transferOwnership(signer1.address);
            
            // Claim ownership
            await multiSig.connect(signer1).claimOwnership();
            
            // Test adding new signer with new owner
            const newSignerAddress = "0x88067Cdd11287e02DBC8f2477490b6098fFF2F7A";
            await multiSig.connect(signer1).addValidSigner(newSignerAddress);
            
            // Verify old owner can't add signers
            await expect(
                multiSig.connect(owner).addValidSigner(newSignerAddress)
            ).to.be.revertedWith("not owner");
        });

        it("Should not allow non-owner to transfer ownership", async function () {
            const { multiSig, signer1, signer2 } = await loadFixture(deployMultiSigFixture);
            
            await expect(
                multiSig.connect(signer1).transferOwnership(signer2.address)
            ).to.be.revertedWith("not owner");
        });
    });

    describe("Signer Management", function () {
        it("Should allow owner to add and remove signers", async function () {
            const { multiSig, owner, nonSigner } = await loadFixture(deployMultiSigFixture);
            
            // Add new signer
            await multiSig.connect(owner).addValidSigner(nonSigner.address);
            
            // Verify new signer can initiate transaction
            await multiSig.connect(nonSigner).initiateTransaction(ethers.parseEther("1"), owner.address);
            
            // Remove signer
            await multiSig.connect(owner).removeSigner(3); // Remove the last added signer
            
            // Verify removed signer can't initiate transaction
            await expect(
                multiSig.connect(nonSigner).initiateTransaction(ethers.parseEther("1"), owner.address)
            ).to.be.revertedWith("not valid signer");
        });

       
    });
});