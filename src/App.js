import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./styles/App.css";
import contractAbi from "./utils/contractABI.json";
import polygonLogo from "./assets/polygonlogo.png";
import ethLogo from "./assets/ethlogo.png";
import { networks } from "./utils/networks";

const tld = ".sarutobi";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

const App = () => {
  const [currentAccount, setCurrentAccount] = useState("");
  const [domain, setDomain] = useState("");
  const [record, setRecord] = useState("");
  const [network, setNetwork] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mints, setMints] = useState([]);
  const [popup, setPopup] = useState({});

  // Implement your connectWallet method here
  const connectWallet = async () => {
    try {
      const { ethereum } = window;

      if (!ethereum) {
        alert("Get MetaMask -> https://metamask.io/");
        return;
      }

      // Fancy method to request access to account.
      const accounts = await ethereum.request({
        method: "eth_requestAccounts",
      });

      // Boom! This should print out public address once we authorize Metamask.
      console.log("Connected", accounts[0]);
      setCurrentAccount(accounts[0]);
    } catch (error) {
      console.log(error);
    }
  };

  const switchNetwork = async () => {
    if (window.ethereum) {
      try {
        // Try to switch to the Mumbai testnet
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x13881" }], // Check networks.js for hexadecimal network ids
        });
      } catch (error) {
        // This error code means that the chain we want has not been added to MetaMask
        // In this case we ask the user to add it to their MetaMask
        if (error.code === 4902) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0x13881",
                  chainName: "Polygon Mumbai Testnet",
                  rpcUrls: ["https://rpc-mumbai.maticvigil.com/"],
                  nativeCurrency: {
                    name: "Mumbai Matic",
                    symbol: "MATIC",
                    decimals: 18,
                  },
                  blockExplorerUrls: ["https://mumbai.polygonscan.com/"],
                },
              ],
            });
          } catch (error) {
            console.log(error);
          }
        }
        console.log(error);
      }
    } else {
      // If window.ethereum is not found then MetaMask is not installed
      alert(
        "MetaMask is not installed. Please install it to use this app: https://metamask.io/download.html"
      );
    }
  };

  // Gotta make sure this is async.
  const checkIfWalletIsConnected = async () => {
    // First make sure we have access to window.ethereum
    const { ethereum } = window;

    if (!ethereum) {
      console.log("Make sure you have MetaMask!");
      return;
    } else {
      console.log("We have the ethereum object", ethereum);
    }

    // Check if we're authorized to access the user's wallet
    const accounts = await ethereum.request({ method: "eth_accounts" });

    // Users can have multiple authorized accounts, we grab the first one if its there!
    if (accounts.length !== 0) {
      const account = accounts[0];
      console.log("Found an authorized account:", account);
      setCurrentAccount(account);
    } else {
      console.log("No authorized account found");
    }

    // This is the new part, we check the user's network chain ID
    const chainId = await ethereum.request({ method: "eth_chainId" });
    setNetwork(networks[chainId]);

    ethereum.on("chainChanged", handleChainChanged);

    // Reload the page when they change networks
    function handleChainChanged(_chainId) {
      window.location.reload();
    }
  };

  const mintDomain = async () => {
    // Don't run if the domain is empty
    if (!domain) {
      return;
    }
    // Alert the user if the domain is too short
    if (domain.length < 3) {
      alert("Domain must be at least 3 characters long");
      return;
    }

    setPopup({ type: "waiting-approval" });

    // Calculate price based on length of domain (change this to match your contract)
    // 3 chars = 0.5 MATIC, 4 chars = 0.3 MATIC, 5 or more = 0.1 MATIC
    const price =
      domain.length === 3 ? "0.5" : domain.length === 4 ? "0.3" : "0.1";
    console.log("Minting domain", domain, "with price", price);
    try {
      const { ethereum } = window;
      if (ethereum) {
        const provider = new ethers.providers.Web3Provider(ethereum);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          contractAbi.abi,
          signer
        );

        console.log("Going to pop wallet now to pay gas...");
        let tx = await contract.register(domain, {
          value: ethers.utils.parseEther(price),
        });

        setPopup({ type: "loading" });

        // Wait for the transaction to be mined
        const receipt = await tx.wait();

        // Check if the transaction was successfully completed
        if (receipt.status === 1) {
          console.log(
            "Domain minted! https://mumbai.polygonscan.com/tx/" + tx.hash
          );

          // Set the record for the domain
          tx = await contract.setRecord(domain, record);
          await tx.wait();

          console.log(
            "Record set! https://mumbai.polygonscan.com/tx/" + tx.hash
          );

          // Call fetchMints after 2 seconds
          setTimeout(() => {
            fetchMints();
          }, 2000);

          setRecord("");
          setDomain("");

          setPopup({ type: "success" });
        } else {
          setPopup({
            type: "error",
            message: "Transaction failed! Please try again",
          });
        }
      }
    } catch (error) {
      console.error(error);
      if (error.code === "ACTION_REJECTED") {
        setPopup({
          type: "error",
          message: "Transaction rejected. Permissions needed to continue.",
        });
      } else {
        setPopup({ type: "error", message: error.message });
      }
    }
  };

  const fetchMints = async () => {
    try {
      const { ethereum } = window;
      if (ethereum) {
        // You know all this
        const provider = new ethers.providers.Web3Provider(ethereum);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          contractAbi.abi,
          signer
        );

        // Get all the domain names from our contract
        const names = await contract.getAllNames();

        // For each name, get the record and the address
        const mintRecords = await Promise.all(
          names.map(async (name) => {
            const mintRecord = await contract.records(name);
            const owner = await contract.domains(name);
            return {
              id: names.indexOf(name),
              name: name,
              record: mintRecord,
              owner: owner,
            };
          })
        );

        console.log("MINTS FETCHED ", mintRecords);
        setMints(mintRecords);
        closePopup();
      }
    } catch (error) {
      console.log(error);
    }
  };

  const updateDomain = async () => {
    if (!record || !domain) {
      return;
    }
    setLoading(true);
    console.log("Updating domain", domain, "with record", record);
    try {
      const { ethereum } = window;
      if (ethereum) {
        const provider = new ethers.providers.Web3Provider(ethereum);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          contractAbi.abi,
          signer
        );

        let tx = await contract.setRecord(domain, record);

        setPopup({ type: "loading" });

        await tx.wait();
        console.log("Record set https://mumbai.polygonscan.com/tx/" + tx.hash);

        fetchMints();
        setRecord("");
        setDomain("");

        setPopup({ type: "success" });
      }
    } catch (error) {
      console.error(error);
      if (error.code === "ACTION_REJECTED") {
        setPopup({
          type: "error",
          message: "Transaction rejected. Permissions needed to continue.",
        });
      } else {
        setPopup({ type: "error", message: error.message });
      }
    }
    setLoading(false);
  };

  // This will take us into edit mode and show us the edit buttons!
  const editRecord = (name) => {
    console.log("Editing record for", name);
    setEditing(true);
    setDomain(name);
  };

  const overlayClosePopup = (event) => {
    if (event.target !== event.currentTarget) return;
    setPopup({});
  };

  const closePopup = (event) => {
    setPopup({});
  };

  // Create a function to render if wallet is not connected yet
  const renderNotConnectedContainer = () => (
    <div className="connect-wallet-container">
      <img
        src="https://media2.giphy.com/media/jzHFPlw89eTqU/giphy.gif?cid=ecf05e47wm5ttfu265bgp85t2ubtabg6vel8jhgie1ujdpv7&ep=v1_gifs_search&rid=giphy.gif&ct=g"
        alt="Shinobi gif"
      />
      <button
        onClick={connectWallet}
        className="cta-button connect-wallet-button"
      >
        Connect Wallet
      </button>
    </div>
  );

  // Form to enter domain name and data
  const renderInputForm = () => {
    // If not on Polygon Mumbai Testnet, render "Please connect to Polygon Mumbai Testnet"
    if (network !== "Polygon Mumbai Testnet") {
      return (
        <div className="connect-wallet-container">
          <p>Please connect to the Polygon Mumbai Testnet</p>
          <button className="cta-button mint-button" onClick={switchNetwork}>
            Click here to switch
          </button>
        </div>
      );
    }

    return (
      <div className="form-container">
        <div className="first-row">
          <input
            type="text"
            value={domain}
            placeholder="domain"
            onChange={(e) => setDomain(e.target.value)}
          />
          <p className="tld"> {tld} </p>
        </div>
        <input
          type="text"
          value={record}
          placeholder="whats ur shinobi power"
          onChange={(e) => setRecord(e.target.value)}
        />
        {editing ? (
          <div className="button-container">
            <button
              className="cta-button mint-button"
              disabled={loading}
              onClick={updateDomain}
            >
              Set record
            </button>
            <button
              className="cta-button mint-button"
              onClick={() => {
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="cta-button mint-button"
            disabled={loading}
            onClick={mintDomain}
          >
            Mint
          </button>
        )}
      </div>
    );
  };

  const renderMints = () => {
    if (currentAccount && mints.length > 0) {
      return (
        <div className="mint-container">
          <p className="subtitle"> Recently minted domains!</p>
          <div className="mint-list">
            {mints.map((mint, index) => {
              return (
                <div className="mint-item" key={index}>
                  <div className="mint-row">
                    <a
                      className="link"
                      href={`https://testnets.opensea.io/assets/mumbai/${CONTRACT_ADDRESS}/${mint.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <p className="underlined">
                        {" "}
                        {mint.name}
                        {tld}{" "}
                      </p>
                    </a>
                    {/* If mint.owner is currentAccount, add an "edit" button*/}
                    {mint.owner.toLowerCase() ===
                    currentAccount.toLowerCase() ? (
                      <button
                        className="edit-button"
                        onClick={() => editRecord(mint.name)}
                      >
                        <img
                          className="edit-icon"
                          src="https://img.icons8.com/metro/26/000000/pencil.png"
                          alt="Edit button"
                        />
                      </button>
                    ) : null}
                  </div>
                  <p> {mint.record} </p>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  };

  const renderPopup = (type, message) => {
    if (type === "loading") {
      return (
        <>
          <div className="popup-overlay">
            <div className="popup">
              <h3 className="popup-title">Loading</h3>
              <img src="/popup-loading-ill.jpeg" alt="popup-loading-ill" />
              <p className="popup-description">
                Your transaction is being processed.
              </p>
              <p className="popup-message">{message}</p>
            </div>
          </div>
        </>
      );
    }
    if (type === "waiting-approval") {
      return (
        <>
          <div className="popup-overlay">
            <div className="popup">
              <h3 className="popup-title">Waiting</h3>
              <img src="/popup-waiting-ill.jpeg" alt="popup-waiting-ill" />
              <p className="popup-description">Waiting for your approval.</p>
              <p className="popup-message">{message}</p>
            </div>
          </div>
        </>
      );
    } else if (type === "error") {
      return (
        <>
          <div onClick={overlayClosePopup} className="popup-overlay">
            <div className="popup">
              <button onClick={closePopup} className="popup-close-btn">
                &times;
              </button>
              <h3 className="popup-title">Failed</h3>
              <img src="/popup-failed-ill.jpeg" alt="popup-failed-ill" />
              <p className="popup-description">
                Your transaction is not completed.
              </p>
              <p className="popup-message">{message}</p>
            </div>
          </div>
        </>
      );
    } else if (type === "success") {
      return (
        <>
          <div onClick={overlayClosePopup} className="popup-overlay">
            <div className="popup">
              <button onClick={closePopup} className="popup-close-btn">
                &times;
              </button>
              <h3 className="popup-title">Success</h3>
              <img src="/popup-success-ill.jpeg" alt="popup-success-ill" />
              <p className="popup-description">
                Your transaction is successfully completed.
              </p>
              <p className="popup-message">{message}</p>
            </div>
          </div>
        </>
      );
    }

    return;
  };

  // This runs our function when the page loads.
  useEffect(() => {
    checkIfWalletIsConnected();
  }, []);

  // This will run any time currentAccount or network are changed
  useEffect(() => {
    if (network === "Polygon Mumbai Testnet") {
      fetchMints();
    }
  }, [currentAccount, network]);

  // Reload on accounts changed
  useEffect(() => {
    function handleAccountsChanged(accounts) {
      window.location.reload();
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, []);

  return (
    <div className="App">
      <div className="container">
        <div className="header-container">
          <header>
            <div className="left">
              <p className="title">🥷🏽 Shinobi Name Service</p>
              <p className="subtitle">
                Unleash Your Digital Jutsu in the Blockchain Realm!
              </p>
            </div>
            {/* Display a logo and wallet connection status*/}
            <div className="right">
              <img
                alt="Network logo"
                className="logo"
                src={network.includes("Polygon") ? polygonLogo : ethLogo}
              />
              {currentAccount ? (
                <p>
                  {" "}
                  Wallet: {currentAccount.slice(0, 6)}...
                  {currentAccount.slice(-4)}{" "}
                </p>
              ) : (
                <p> Not connected </p>
              )}
            </div>
          </header>
        </div>

        {!currentAccount && renderNotConnectedContainer()}
        {currentAccount && renderInputForm()}
        {mints && renderMints()}

        <div className="footer-container">
          Built with ❤️ by&nbsp;
          <a
            className="footer-text"
            href="https://github.com/adamcanray"
            target="_blank"
            rel="noreferrer"
          >
            Adam Canray
          </a>
        </div>
      </div>

      {renderPopup(popup.type, popup.message)}
    </div>
  );
};

export default App;
